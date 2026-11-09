import { test, expect, type Page } from '@playwright/test';
import { setupCleanEnvironment } from './fixtures/test-utils';

// A statement of transfers: one row per transfer, the date and the time
// apart, a phone number for each end. A row has no payee, the last one the
// same name at both ends.
const TRANSFERS = [
  'donneur;beneficiaire;montant;date;heure;tel_donneur;tel_beneficiaire;naissance_donneur',
  'Jean Martin;Paul Durand;120;2024-02-10;09:15:30;0601010101;0602020202;29031979',
  'Jean Martin;Paul Durand;80;2024-02-11;18:02:00;0601010101;0602020202;29031979',
  'Jean Martin;Anne Petit;35;2024-02-15;07:45:10;0601010101;0603030303;inconnue',
  'Anne Petit;;10;2024-02-16;08:00:00;0603030303;;',
  'Anne Petit;Anne Petit;5;2024-02-17;10:00:00;0603030303;;',
].join('\n');

/** Rows of a store of the app's IndexedDB */
async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate((name) => new Promise<T[]>((resolve, reject) => {
    const req = indexedDB.open('zeroneurone');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const all = req.result.transaction(name, 'readonly').objectStore(name).getAll();
      all.onsuccess = () => resolve(all.result as T[]);
      all.onerror = () => reject(all.error);
    };
  }), store);
}

interface StoredLink {
  fromId: string; toId: string; label: string; direction: string;
  dateRange: { start: string | Date; end: string | Date } | null;
  properties: { key: string; value: unknown; type?: string }[];
}

test('rows become directed links; a pivot attaches to the end it belongs to', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'virements.csv', mimeType: 'text/csv', buffer: Buffer.from(TRANSFERS, 'utf-8'),
  });
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });

  await modal.locator('[data-testid="json-mapping-record-as"]').selectOption('link');
  await modal.locator('[data-testid="json-mapping-link-fromField"]').selectOption('donneur');
  await modal.locator('[data-testid="json-mapping-link-toField"]').selectOption('beneficiaire');
  await modal.locator('[data-testid="json-mapping-link-dateField"]').selectOption('date');
  // The time column is found from the date one
  await expect(modal.locator('[data-testid="json-mapping-link-timeField"]')).toHaveValue('heure');
  await modal.getByPlaceholder('{first_name} {last_name}').fill('{montant} EUR');
  await modal.locator('[data-testid="json-mapping-target-tel_donneur"]').selectOption('pivot');
  await modal.locator('[data-testid="json-mapping-target-tel_beneficiaire"]').selectOption('pivot');
  await modal.locator('[data-testid="json-mapping-owner-tel_beneficiaire"]').selectOption('beneficiaire');
  await modal.locator('[data-testid="json-mapping-target-naissance_donneur"]').selectOption('date');
  // The payer's birth date goes on the payer, not on each transfer
  await modal.locator('[data-testid="json-mapping-holder-naissance_donneur"]').selectOption('from');
  await modal.locator('[data-testid="json-mapping-import"]').click();

  await expect(modal).toBeHidden();
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });
  // The canvas only renders the nodes in view: count in the database
  await expect.poll(async () => (await readStore(page, 'elements')).length, { timeout: 10000 }).toBe(6);

  const els = await readStore<{ id: string; label: string; properties: { key: string; value: unknown; type?: string }[] }>(page, 'elements');
  const id = (label: string) => els.find((e) => e.label === label)!.id;
  expect(els.map((e) => e.label).sort()).toEqual(
    ['0601010101', '0602020202', '0603030303', 'Anne Petit', 'Jean Martin', 'Paul Durand'],
  );

  const links = await readStore<StoredLink>(page, 'links');
  // One link per transfer (the row without a payee skipped), from payer to payee
  const transfers = links.filter((l) => l.direction === 'forward');
  expect(transfers.map((l) => l.label).sort()).toEqual(['120 EUR', '35 EUR', '80 EUR']);
  const first = transfers.find((l) => l.label === '120 EUR')!;
  expect([first.fromId, first.toId]).toEqual([id('Jean Martin'), id('Paul Durand')]);
  // Dated at the minute: the date and the time of their own columns
  const start = new Date(first.dateRange!.start);
  expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([10, 9, 15]);

  // Each phone number linked to its own end, once
  const pivots = links.filter((l) => l.direction === 'none').map((l) => [l.fromId, l.toId].sort().join('|')).sort();
  expect(pivots).toEqual([
    [id('Jean Martin'), id('0601010101')].sort().join('|'),
    [id('Paul Durand'), id('0602020202')].sort().join('|'),
    [id('Anne Petit'), id('0603030303')].sort().join('|'),
  ].sort());

  // A transfer to oneself: no link, an event of the element, dated with its time
  const self = (await readStore<{ label: string; events?: { label: string; date: string | Date }[] }>(page, 'elements'))
    .find((e) => e.label === 'Anne Petit')!;
  expect(self.events?.map((ev) => [ev.label, new Date(ev.date).getHours()])).toEqual([['5 EUR', 10]]);

  // On the payer: the compact date read once for its two rows, the value
  // that is no date kept as written; nothing of it on the transfers
  const payer = els.find((e) => e.label === 'Jean Martin')!;
  const births = payer.properties.filter((p) => p.key === 'naissance_donneur');
  expect(births.map((p) => p.type).sort()).toEqual(['date', 'text']);
  expect(births.find((p) => p.type === 'text')?.value).toBe('inconnue');
  expect(transfers.every((l) => !l.properties.some((p) => p.key === 'naissance_donneur'))).toBe(true);
  expect(first.properties.find((p) => p.key === 'montant')?.value).toBe(120);
});

test('a field put on an end already in the dossier is added to it; one undo takes it back', async ({ page }) => {
  await setupCleanEnvironment(page);
  const first = ['donneur;beneficiaire', 'Jean Martin;Paul Durand'].join('\n');
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(first, 'utf-8'),
  });
  let modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.locator('[data-testid="json-mapping-record-as"]').selectOption('link');
  await modal.locator('[data-testid="json-mapping-import"]').click();
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });
  await expect.poll(async () => (await readStore(page, 'links')).length, { timeout: 10000 }).toBe(1);

  const second = ['donneur;beneficiaire;ville_beneficiaire', 'Anne Petit;Paul Durand;Lyon', 'Jean Martin;Paul Durand;Lyon'].join('\n');
  await page.evaluate((text) => window.dispatchEvent(new CustomEvent('zn:json-mapping-paste', { detail: { text } })), second);
  modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 10000 });
  await modal.locator('[data-testid="json-mapping-record-as"]').selectOption('link');
  await modal.locator('[data-testid="json-mapping-link-fromField"]').selectOption('donneur');
  await modal.locator('[data-testid="json-mapping-link-toField"]').selectOption('beneficiaire');
  await modal.locator('[data-testid="json-mapping-holder-ville_beneficiaire"]').selectOption('to');
  await modal.locator('[data-testid="json-mapping-attach-existing"]').check();
  await modal.locator('[data-testid="json-mapping-import"]').click();
  await page.locator('.react-flow__pane').click({ position: { x: 200, y: 200 } });

  const payee = async () => {
    const els = await readStore<{ label: string; properties: { key: string; value: unknown }[] }>(page, 'elements');
    return els.find((e) => e.label === 'Paul Durand')?.properties.map((p) => [p.key, p.value]);
  };
  // Added once to the payee already there, though two rows name it
  await expect.poll(payee, { timeout: 10000 }).toEqual([['ville_beneficiaire', 'Lyon']]);
  expect((await readStore(page, 'elements')).length).toBe(3);
  expect((await readStore(page, 'links')).length).toBe(3);

  await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
  await page.keyboard.press('Control+z');
  await expect.poll(payee, { timeout: 10000 }).toEqual([]);
});

test('the hours of the file are read in the zone chosen for it', async ({ page }) => {
  await setupCleanEnvironment(page);
  const text = ['donneur;beneficiaire;date;heure', 'Jean Martin;Paul Durand;2024-02-10;09:15:30'].join('\n');
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'virements.csv', mimeType: 'text/csv', buffer: Buffer.from(text, 'utf-8'),
  });
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.locator('[data-testid="json-mapping-record-as"]').selectOption('link');
  await expect(modal.locator('[data-testid="json-mapping-link-timeField"]')).toHaveValue('heure');
  // The zone button next to the date: Tokyo (no summer time)
  await modal.getByTitle(/^Time zone/).click();
  await page.getByPlaceholder('City or zone').fill('Tokyo');
  await page.getByRole('button', { name: 'Asia/Tokyo', exact: true }).click();
  await modal.locator('[data-testid="json-mapping-import"]').click();
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });
  await expect.poll(async () => (await readStore(page, 'links')).length, { timeout: 10000 }).toBe(1);
  const [link] = await readStore<StoredLink & { dateRange: { start: Date; timeZone?: string } }>(page, 'links');
  expect(new Date(link.dateRange.start).toISOString()).toBe('2024-02-10T00:15:30.000Z');
  expect(link.dateRange.timeZone).toBe('Asia/Tokyo');
});

// Councillors and their towns: two councillors of one name, two towns of one name
const COUNCILLORS = [
  'elu;prenom;naissance;commune;code_commune;csp',
  'ARMANDO;Jean;1960-02-01;Saint-Martin;01001;Agriculteur',
  'ARMANDO;Paul;1971-05-12;Saint-Martin;02002;Cadre',
  'ARMANDO;Jean;1960-02-01;Lyon;69123;Agriculteur',
  'DUPONT;Anne;1980-01-01;Lyon;69123;Cadre',
].join('\n');

test('fields identifying an end keep homonyms apart, their links too', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'elus.csv', mimeType: 'text/csv', buffer: Buffer.from(COUNCILLORS, 'utf-8'),
  });
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });

  await modal.locator('[data-testid="json-mapping-record-as"]').selectOption('link');
  await modal.locator('[data-testid="json-mapping-link-fromField"]').selectOption('elu');
  await modal.locator('[data-testid="json-mapping-link-toField"]').selectOption('commune');
  // The birth date is the councillor's, not the link's
  await modal.locator('[data-testid="json-mapping-link-dateField"]').selectOption('');
  for (const f of ['prenom', 'naissance', 'csp']) {
    await modal.locator(`[data-testid="json-mapping-holder-${f}"]`).selectOption('from');
  }
  await modal.locator('[data-testid="json-mapping-holder-code_commune"]').selectOption('to');
  // Fields on an end, none telling homonyms apart: said
  await expect(modal.locator('[data-testid="json-mapping-link-homonyms"]')).toHaveText(/From, To/);
  await modal.locator('[data-testid="json-mapping-holder-prenom"]').selectOption('from-id');
  await modal.locator('[data-testid="json-mapping-holder-naissance"]').selectOption('from-id');
  await modal.locator('[data-testid="json-mapping-holder-code_commune"]').selectOption('to-id');
  await expect(modal.locator('[data-testid="json-mapping-link-homonyms"]')).toHaveCount(0);
  await modal.locator('[data-testid="json-mapping-import"]').click();
  await expect(modal).toBeHidden();
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });

  await expect.poll(async () => (await readStore(page, 'elements')).length, { timeout: 10000 }).toBe(6);
  const els = await readStore<{ id: string; label: string; properties: { key: string; value: unknown }[] }>(page, 'elements');
  const prop = (e: { properties: { key: string; value: unknown }[] }, k: string) => e.properties.find((p) => p.key === k)?.value;
  const armandos = els.filter((e) => e.label === 'ARMANDO');
  expect(armandos.map((e) => prop(e, 'prenom')).sort()).toEqual(['Jean', 'Paul']);
  const towns = els.filter((e) => e.label === 'Saint-Martin');
  expect(towns.map((e) => String(prop(e, 'code_commune'))).sort()).toEqual(['01001', '02002']);

  // Jean ARMANDO is linked to his two towns, Paul to his one
  const links = await readStore<StoredLink>(page, 'links');
  expect(links).toHaveLength(4);
  const jean = armandos.find((e) => prop(e, 'prenom') === 'Jean')!;
  const paul = armandos.find((e) => prop(e, 'prenom') === 'Paul')!;
  const label = (id: string) => els.find((e) => e.id === id)!.label;
  expect(links.filter((l) => l.fromId === jean.id).map((l) => label(l.toId)).sort()).toEqual(['Lyon', 'Saint-Martin']);
  expect(links.filter((l) => l.fromId === paul.id).map((l) => l.toId)).toEqual([towns.find((e) => String(prop(e, 'code_commune')) === '02002')!.id]);
});
