import { test, expect, devices, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import { setupCleanEnvironment } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';
import { ydocStorage } from './fixtures/ydoc-storage';

/**
 * Mobile companion (/m/): a desktop shares a dossier in async mode, a phone
 * joins it from the companion link, captures (note, photo, position),
 * comments, and captures offline. The desktop must receive everything.
 * Dev server only: drives the desktop stores through Vite's module URLs.
 *
 * COMPANION_SHOTS=<dir> saves a screenshot of each phone screen there.
 */

const RELAY_PORT = Number(process.env.COMPANION_RELAY_PORT ?? 4461);
const SERVER = `ws://localhost:${RELAY_PORT}`;
const SHOTS = process.env.COMPANION_SHOTS;

let relay: ChildProcess;

// One relay for the file (beforeAll): its tests must not run side by side,
// or the first to end stops the relay under the other
test.describe.configure({ mode: 'serial' });

// Mobile emulation (isMobile, touch) is Chromium only
test.skip(({ browserName }) => browserName !== 'chromium', 'mobile emulation needs Chromium');

test.beforeAll(async () => {
  relay = spawn('node', ['relay/index.js'], { stdio: 'ignore', env: { ...process.env, PORT: String(RELAY_PORT) } });
  const deadline = Date.now() + 10_000;
  for (;;) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = connect(RELAY_PORT, 'localhost', () => { socket.end(); resolve(true); });
      socket.on('error', () => resolve(false));
    });
    if (open) break;
    if (Date.now() > deadline) throw new Error('relay did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
});

test.afterAll(() => { relay?.kill(); });

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

async function newDesktop(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((server) => localStorage.setItem('zeroneurone-signaling-server', server), SERVER);
  const page = await context.newPage();
  await setupCleanEnvironment(page);
  return page;
}

async function newPhone(browser: Browser): Promise<Page> {
  const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
  const context = await browser.newContext({
    ...iphone,
    locale: 'fr-FR',
    geolocation: { latitude: 48.8566, longitude: 2.3522, accuracy: 12 },
    permissions: ['geolocation'],
  });
  return context.newPage();
}

let phonePage: Page | null = null;

/**
 * Desktop-side view of the dossier. Both stores apply remote changes on the
 * next animation frame, which a background tab never gets: the page read is
 * brought to front, then the phone again.
 */
async function desktopState(page: Page) {
  await page.bringToFront();
  await page.waitForTimeout(100);
  const state = await readDesktop(page);
  await phonePage?.bringToFront();
  return state;
}

/** Desktop links with their ends' labels */
async function readLinks(page: Page) {
  await page.bringToFront();
  await page.waitForTimeout(100);
  const links = await page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const label = (id: string) => d.elements.find((e) => e.id === id)?.label ?? '?';
    return d.links.map((l) => ({ label: l.label, from: label(l.fromId), to: label(l.toId), direction: l.direction }));
  });
  await phonePage?.bringToFront();
  return links;
}

async function readDesktop(page: Page) {
  return page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    return {
      labels: d.elements.map((e) => e.label),
      elements: d.elements.map((e) => ({ id: e.id, label: e.label, notes: e.notes, geo: e.geo, assetIds: e.assetIds, tags: e.tags, properties: e.properties, source: e.source, date: e.date, events: (e.events ?? []).map((ev) => ({ label: ev.label, date: ev.date, precision: ev.precision, geo: ev.geo, description: ev.description })) })),
      tabs: (await import('/src/stores/tabStore.ts')).useTabStore.getState().tabs.map((t) => ({ name: t.name, members: t.memberElementIds })),
      assets: d.assets.map((a) => ({ id: a.id, thumb: !!a.thumbnailDataUrl, mime: a.mimeType })),
      comments: d.comments.map((c) => ({ content: c.content, author: c.authorName })),
    };
  });
}

test('a phone joins, captures, comments and catches up offline', async ({ browser }) => {
  test.setTimeout(4 * 60 * 1000);

  // ── Desktop imports a dossier and shares it in async mode ────────────────
  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'companion.json');
  writeFileSync(file, buildLargeDossierJson(30));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await desktop.waitForTimeout(2000);
  // Dates, an event and positions, for the map and the timeline
  const eventOwner = await desktop.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const els = d.elements.slice(0, 8);
    for (let i = 0; i < els.length; i++) {
      await d.updateElement(els[i].id, {
        geo: { type: 'point', lat: 48.85 + i * 0.004, lng: 2.33 + (i % 3) * 0.01 },
        date: new Date(2026, 9, 1 + (i % 3), 9 + i, 15),
        // Periods over three years, for the timeline's jump strip
        dateRange: { start: new Date(2024 + (i % 3), i, 10), end: null },
      });
    }
    await d.updateElement(els[0].id, {
      events: [{ id: crypto.randomUUID(), date: new Date(2026, 8, 20), label: 'Ouverture du compte' }],
    });
    return els[0].label;
  });
  const mobileUrl = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Terrain', true);
    const id = syncService.getDossierId()!;
    return syncService.buildShareUrl(id, encryptionKey, 'Terrain', syncService.isAsync(), 'm', undefined, true);
  });
  expect(mobileUrl).toContain('/m/');
  expect(mobileUrl).toContain('async=1');

  // The share window offers the mobile QR code (async session)
  await desktop.locator('button[title="Share"]').click();
  await desktop.getByRole('button', { name: 'Open on mobile' }).click();
  await expect(desktop.getByRole('img', { name: 'Mobile companion QR code' })).toBeVisible();
  await shot(desktop, '00-desktop-qr');
  await desktop.keyboard.press('Escape');

  // ── Phone joins ──────────────────────────────────────────────────────────
  const phone = await newPhone(browser);
  phonePage = phone;
  // The desktop link works too: on a phone screen it goes to the companion
  await phone.goto(mobileUrl.replace('/m/', '/join/'));
  await expect(phone).toHaveURL(/\/m\/[^/]+\?/);
  await expect(phone.getByRole('heading', { name: 'Terrain' })).toBeVisible();
  await shot(phone, '01-join');
  await phone.getByLabel('Votre nom').fill('Agent terrain');
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  // The key leaves the address bar
  await expect(phone).toHaveURL(/\/m\/d\//);
  expect(phone.url()).not.toContain('key=');
  await expect(phone.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });
  await shot(phone, '02-list');

  // ── The desktop works on an element: the phone shows who, then the change ─
  const watched = await desktop.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const el = d.elements.find((e) => e.label === 'Jean Dupont 0')!;
    useSyncStore.getState().updateSelection([el.id]);
    return el.id;
  });
  await phone.bringToFront();
  const watchedRow = phone.locator('li').filter({ has: phone.getByText('Jean Dupont 0', { exact: true }) });
  await expect(watchedRow.getByRole('img', { name: / consulte$/ })).toBeVisible({ timeout: 20_000 });
  await desktop.evaluate(async (id) => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    useSyncStore.getState().updateEditing(id);
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    await d.updateElement(id, { notes: 'Repris sur le poste' });
  }, watched);
  await phone.bringToFront();
  await expect(watchedRow.getByRole('img', { name: / modifie$/ })).toBeVisible({ timeout: 20_000 });
  await expect(watchedRow).toHaveAttribute('data-touched', 'true', { timeout: 20_000 });
  await shot(phone, '02b-peer-editing');
  await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    useSyncStore.getState().updateEditing(null);
    useSyncStore.getState().updateSelection([]);
  });
  await phone.bringToFront();
  await expect(watchedRow.getByRole('img')).toBeHidden({ timeout: 20_000 });

  // The list can be ordered by name or by links
  const firstRow = () => phone.locator('main ul li').first().locator('span.block').first().innerText();
  await phone.getByRole('button', { name: 'Nom', exact: true }).click();
  const names = await phone.locator('main ul li span.block.text-sm').allInnerTexts();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true })));
  await phone.getByRole('button', { name: 'Liens', exact: true }).click();
  const counts = (await phone.locator('main ul li').allInnerTexts()).map((t) => Number(t.trim().split('\n').pop()));
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  expect(counts[0]).toBeGreaterThan(0);
  await shot(phone, '02c-sorted-links');
  await phone.getByRole('button', { name: 'Récents', exact: true }).click();
  expect(await firstRow()).toBeTruthy();

  // Search
  await phone.getByPlaceholder('Rechercher').fill('sophie');
  await shot(phone, '03-search');
  await phone.getByText(/^Sophie /).first().click();
  const sophie = (await phone.locator('header span.truncate').textContent())!;
  await shot(phone, '04-detail');

  // The page fits the screen: only the content area scrolls
  expect(await phone.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);

  // Edit the note (Markdown, shown rendered) and a property value
  await phone.getByRole('button', { name: 'Ajouter une note' }).click();
  await phone.getByLabel('Note').fill('Vu **deux fois** devant le dépôt');
  await phone.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(phone.locator('strong', { hasText: 'deux fois' })).toBeVisible();
  await phone.getByRole('button', { name: /^ville/ }).click();
  await phone.getByLabel('ville').fill('Lyon');
  await phone.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(phone.getByRole('button', { name: /^ville\s*Lyon/ })).toBeVisible();
  await shot(phone, '04a-edited');

  // Country property: picked from the list, shown by name
  await desktop.evaluate(async (label) => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const el = d.elements.find((e) => e.label === label)!;
    await d.updateElement(el.id, { properties: [...el.properties, { key: 'pays', value: 'FR', type: 'country' }] });
  }, sophie);
  await phone.bringToFront();
  await expect(phone.getByRole('button', { name: /^pays\s*France/ })).toBeVisible({ timeout: 20_000 });
  await phone.getByRole('button', { name: /^pays/ }).click();
  await phone.getByLabel('pays').selectOption('DE');
  await expect(phone.getByRole('button', { name: /^pays\s*Allemagne/ })).toBeVisible();

  // Links in a few taps: to an existing element, then to one created on the spot
  const linksBefore = (await readLinks(desktop)).length;
  await phone.getByRole('button', { name: 'Lier', exact: true }).click();
  await phone.getByPlaceholder(/^Lier « /).fill('anne');
  await phone.getByRole('dialog').getByRole('button', { name: /^Anne / }).first().click();
  await phone.getByRole('radio', { name: 'Vers' }).click();
  await expect(phone.getByRole('radio', { name: 'Vers' })).toHaveAttribute('aria-checked', 'true');
  await expect(phone.getByRole('radio', { name: 'Vers' })).toHaveClass(/border-accent/);
  await phone.getByLabel('Libellé').fill('connaît');
  await shot(phone, '04f-link-form');
  await phone.getByRole('button', { name: 'Créer le lien' }).click();
  await expect(phone.getByRole('dialog')).toBeHidden();
  await phone.getByRole('button', { name: 'Lier', exact: true }).click();
  await phone.getByPlaceholder(/^Lier « /).fill('Garage Martin');
  await phone.getByRole('button', { name: 'Créer « Garage Martin »' }).click();
  await phone.getByLabel('Libellé').fill('connaît');
  await phone.getByRole('button', { name: 'Créer le lien' }).click();
  await expect(phone.getByRole('dialog')).toBeHidden();
  await expect.poll(async () => {
    const links = await readLinks(desktop);
    const st = await desktopState(desktop);
    const el = st.elements.find((e) => e.label === sophie);
    return {
      added: links.length - linksBefore,
      labels: links.filter((l) => l.label === 'connaît').map((l) => `${l.from}>${l.to}|${l.direction}`).sort(),
      pays: el?.properties.find((p) => p.key === 'pays')?.value,
    };
  }, { timeout: 20_000 }).toEqual({
    added: 2,
    labels: expect.arrayContaining([expect.stringMatching(new RegExp(`^${sophie}>Anne .*\\|forward$`)), `${sophie}>Garage Martin|none`]),
    pays: 'DE',
  });

  // A link edited from the phone: label and direction
  const garageRow = phone.getByRole('listitem').filter({ hasText: 'Garage Martin' });
  await garageRow.getByRole('button', { name: 'Modifier le lien' }).click();
  await garageRow.getByLabel('Libellé').fill('propriétaire de');
  await garageRow.getByRole('radio', { name: 'Vers' }).click();
  await shot(phone, '04f-link-edit');
  await garageRow.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await readLinks(desktop)).filter((l) => l.to === 'Garage Martin').map((l) => `${l.label}|${l.direction}`), { timeout: 20_000 })
    .toEqual(['propriétaire de|forward']);

  // Deletion, confirmed: the link to Garage Martin, then Garage Martin itself
  await garageRow.getByRole('button', { name: 'Modifier le lien' }).click();
  await garageRow.getByRole('button', { name: 'Supprimer le lien' }).click();
  await garageRow.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(garageRow).toHaveCount(0);
  await expect.poll(async () => (await readLinks(desktop)).some((l) => l.to === 'Garage Martin'), { timeout: 20_000 }).toBe(false);
  await phone.getByPlaceholder('Rechercher').fill('Garage Martin');
  await phone.getByRole('button', { name: /^Garage Martin/ }).first().click();
  // Renamed from the pencil beside its name
  await phone.getByRole('button', { name: 'Renommer' }).click();
  await phone.getByLabel('Renommer').fill('Garage Martin SARL');
  await phone.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(phone.locator('header span.truncate')).toHaveText('Garage Martin SARL');
  await expect.poll(async () => (await desktopState(desktop)).labels, { timeout: 20_000 }).toContain('Garage Martin SARL');
  await phone.getByRole('button', { name: "Supprimer l'élément" }).click();
  await expect(phone.getByText('Supprimer « Garage Martin SARL » ?')).toBeVisible();
  await shot(phone, '04g-delete-confirm');
  await phone.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect.poll(async () => (await desktopState(desktop)).labels, { timeout: 20_000 }).not.toContain('Garage Martin SARL');
  // Canvas tabs: create one, put the element in it, show that tab only
  await phone.getByRole('button', { name: 'Gérer les onglets' }).click();
  await phone.getByLabel("Nom de l'onglet").fill('Repérages');
  await phone.getByRole('button', { name: "Créer l'onglet" }).click();
  await expect(phone.getByRole('dialog').getByText('Repérages')).toBeVisible();
  await phone.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
  await phone.getByPlaceholder('Rechercher').fill(sophie);
  await phone.getByRole('button', { name: new RegExp(`^${sophie}`) }).first().click();
  await phone.getByRole('button', { name: 'Repérages', pressed: false }).click();
  await expect(phone.getByRole('button', { name: 'Repérages', pressed: true })).toBeVisible();
  await expect.poll(async () => {
    const st = await desktopState(desktop);
    const id = st.elements.find((e) => e.label === sophie)?.id;
    return st.tabs.find((t) => t.name === 'Repérages')?.members.includes(id ?? '') ?? false;
  }, { timeout: 20_000 }).toBe(true);
  await phone.getByRole('button', { name: 'Effacer la recherche' }).click();
  await phone.getByRole('tab', { name: 'Repérages' }).click();
  await expect(phone.getByRole('button', { name: new RegExp(`^${sophie}`) })).toBeVisible();
  await expect(phone.getByRole('button', { name: /^Jean Dupont 0/ })).toHaveCount(0);
  await shot(phone, '04h-tab-filter');
  await phone.getByRole('tab', { name: 'Tout' }).click();

  // An element found through one of its events opens on that event
  await phone.getByPlaceholder('Rechercher').fill('ouverture');
  await phone.getByRole('button', { name: new RegExp(`^${eventOwner}`) }).first().click();
  await expect(phone.locator('li[aria-current="true"]')).toContainText('Ouverture du compte');
  await shot(phone, '04i-event-focus');
  await phone.goBack();

  // Tags: from an element's page, then with "#"
  await phone.getByPlaceholder('Rechercher').fill(sophie);
  await phone.getByRole('button', { name: new RegExp(`^${sophie}`) }).first().click();
  const tagChip = phone.locator('main').getByRole('button', { name: /^tag-\d+$/ }).first();
  const sophieTag = (await tagChip.textContent())!;
  await tagChip.click();
  await expect(phone.getByRole('button', { name: `Retirer le tag ${sophieTag}` })).toBeVisible();
  await expect(phone.getByRole('button', { name: new RegExp(`^${sophie}`) })).toBeVisible();
  await phone.getByRole('button', { name: `Retirer le tag ${sophieTag}` }).click();
  await phone.getByPlaceholder('Rechercher').fill('#tag-1');
  await expect(phone.getByRole('button', { name: /^tag-1\b/ }).first()).toBeVisible();
  await shot(phone, '04j-tag-suggest');
  await phone.getByRole('button', { name: /^tag-1\s/ }).first().click();
  await expect(phone.getByRole('button', { name: /^Retirer le tag tag-1/ })).toBeVisible();
  await phone.getByRole('button', { name: /^Retirer le tag tag-1/ }).click();

  // Back on the element the flow continues from
  await phone.getByPlaceholder('Rechercher').fill(sophie);
  await phone.getByRole('button', { name: new RegExp(`^${sophie}`) }).first().click();
  await expect(phone.locator('header span.truncate')).toHaveText(sophie);
  await expect.poll(async () => {
    const st = await desktopState(desktop);
    const el = st.elements.find((e) => e.label === sophie);
    return el ? { notes: el.notes, ville: el.properties.find((p) => p.key === 'ville')?.value } : null;
  }, { timeout: 20_000 }).toEqual({ notes: 'Vu **deux fois** devant le dépôt', ville: 'Lyon' });

  // Neighbourhood graph: tapping a neighbour opens it, back returns
  const neighbour = phone.locator('.react-flow__node').nth(1);
  await expect(neighbour).toBeVisible({ timeout: 15_000 });
  await phone.locator('.react-flow__node').first().scrollIntoViewIfNeeded();
  await shot(phone, '04b-graph');
  const neighbourName = (await neighbour.textContent())!.replace('…', '');
  await neighbour.click();
  await expect(phone.locator('header span.truncate')).toContainText(neighbourName);
  await phone.getByRole('button', { name: '2', exact: true }).click();
  await shot(phone, '04c-graph-depth2');
  await phone.goBack();
  await expect(phone.locator('header span.truncate')).toHaveText(sophie);

  // ── Timeline and map ───────────────────────────────────────────────────
  await phone.goBack();
  await phone.getByRole('button', { name: 'Chronologie' }).click();
  await expect(phone.getByText('Ouverture du compte')).toBeVisible();
  // Jump strip by year; the order can be reversed
  await expect(phone.getByRole('button', { name: /^2024, \d+ entrée/ })).toBeVisible();
  await shot(phone, '04d-timeline');
  const firstEntry = () => phone.locator('li[data-index="0"]').innerText();
  const oldest = await firstEntry();
  await phone.getByRole('button', { name: "Plus récent d'abord" }).click();
  await expect(phone.getByRole('button', { name: "Plus récent d'abord" })).toHaveAttribute('aria-pressed', 'true');
  expect(await firstEntry()).not.toBe(oldest);
  await phone.getByRole('button', { name: "Plus récent d'abord" }).click();
  await phone.getByRole('button', { name: /^2026, / }).click();
  await expect(phone.locator('button[data-period="2026"]')).toHaveAttribute('aria-current', 'true');
  // An event opens its element on it
  await phone.getByText('Ouverture du compte').click();
  await expect(phone.locator('header span.truncate')).toHaveText(eventOwner);
  await expect(phone.locator('[aria-current="true"]', { hasText: 'Ouverture du compte' })).toBeVisible();
  await phone.goBack();
  await phone.getByRole('button', { name: 'Carte' }).click();
  await expect(phone.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  await expect(phone.getByText('Aucun élément localisé')).toBeHidden();
  await phone.waitForTimeout(2500);
  await shot(phone, '04e-map');
  await phone.getByRole('button', { name: 'Éléments' }).click();
  await phone.getByText(/^Sophie /).first().click();

  // ── Comment from the phone ───────────────────────────────────────────────
  await phone.getByPlaceholder('Commentaire').fill('Vu sur place ce matin');
  await phone.getByRole('button', { name: 'Envoyer' }).click();
  await expect(phone.getByText('Vu sur place ce matin')).toBeVisible();
  await expect.poll(async () => (await desktopState(desktop)).comments.map((c) => c.content), { timeout: 20_000 })
    .toContain('Vu sur place ce matin');
  expect((await desktopState(desktop)).comments.find((c) => c.content === 'Vu sur place ce matin')?.author).toBe('Agent terrain');
  await shot(phone, '05-commented');

  // ── Capture with a photo and the position ────────────────────────────────
  await phone.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await phone.getByLabel('Titre').fill('Véhicule suspect');
  await phone.getByLabel('Note').fill('Garé devant le n° 12');
  await phone.getByLabel('Source', { exact: true }).fill('Témoin rue Haute');
  await phone.locator('input[type="file"][capture]').setInputFiles('public/logo-512.png');
  // A file from the phone too; a type the desktop refuses is turned down
  await phone.getByTestId('capture-files').setInputFiles({ name: 'outil.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await expect(phone.getByText('Type non pris en charge : outil.exe')).toBeVisible();
  await phone.getByTestId('capture-files').setInputFiles({ name: 'releve.txt', mimeType: 'text/plain', buffer: Buffer.from('Plaque AB-123-CD') });
  await expect(phone.getByText('releve.txt')).toBeVisible();
  await phone.getByRole('button', { name: 'Ajouter ma position' }).click();
  await expect(phone.getByText(/48\.85660, 2\.35220/)).toBeVisible();
  await shot(phone, '06-capture-form');
  await phone.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(phone.getByText('Garé devant le n° 12')).toBeVisible({ timeout: 20_000 });
  await shot(phone, '07-captured');

  await expect.poll(async () => (await desktopState(desktop)).labels, { timeout: 30_000 }).toContain('Véhicule suspect');
  await expect.poll(async () => {
    const s = await desktopState(desktop);
    const el = s.elements.find((e) => e.label === 'Véhicule suspect');
    if (!el || el.assetIds.length !== 2) return false;
    const mine = s.assets.filter((a) => el.assetIds.includes(a.id));
    return mine.some((a) => a.thumb && a.mime === 'image/jpeg') && mine.some((a) => a.mime === 'text/plain');
  }, { timeout: 30_000 }).toBe(true);
  const captured = (await desktopState(desktop)).elements.find((e) => e.label === 'Véhicule suspect')!;
  expect(captured.notes).toBe('Garé devant le n° 12');
  expect(captured.source).toBe('Témoin rue Haute');
  // The collection date, set at capture
  expect(Date.now() - new Date(captured.date as string | Date).getTime()).toBeLessThan(5 * 60_000);
  expect(captured.geo).toMatchObject({ type: 'point', lat: 48.8566, lng: 2.3522 });

  // Full-text search finds the note, with an excerpt around the match
  await phone.getByRole('button', { name: 'Éléments' }).click();
  await phone.getByPlaceholder('Rechercher').fill('devamt');
  await expect(phone.getByRole('button', { name: /Véhicule suspect/ }).locator('mark', { hasText: 'devant' })).toBeVisible();
  await expect(phone.getByText('Véhicule suspect')).toBeVisible();
  await shot(phone, '07b-search-note');
  await phone.getByText('Véhicule suspect').click();
  await phone.goBack();
  await expect(phone.getByPlaceholder('Rechercher')).toHaveValue('devamt');
  await phone.getByText('Véhicule suspect').click();

  // ── Desktop comments: the phone sees it ──────────────────────────────────
  await desktop.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const target = d.elements.find((e) => e.label === 'Véhicule suspect')!;
    await d.createComment(target.id, 'element', 'Bien reçu, plaque ?');
  });
  await phone.bringToFront();
  await expect(phone.getByText('Bien reçu, plaque ?')).toBeVisible({ timeout: 20_000 });

  // ── Text only, then tags and properties from the dossier ─────────────────
  await desktop.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    await d.updateElement(d.elements[1].id, { tags: [...d.elements[1].tags, 'Témoin'] });
  });
  await phone.bringToFront();
  await phone.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await phone.getByLabel('Titre').fill('Note rapide');
  await phone.getByLabel('Note').fill('Texte seul');
  await phone.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await phone.getByRole('button', { name: 'Modifier les tags' }).click();
  await phone.getByRole('button', { name: 'Témoin', exact: true }).click();
  await expect(phone.getByRole('button', { name: 'Témoin', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shot(phone, '07c-tags');
  await phone.getByRole('button', { name: 'Terminé' }).click();
  await phone.getByRole('button', { name: 'Propriété', exact: true }).click();
  await phone.getByLabel('Nom de la propriété').fill('vil');
  await phone.getByRole('button', { name: 'ville', exact: true }).click();
  await phone.getByLabel('ville').fill('Paris');
  await phone.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(phone.getByRole('button', { name: /^ville\s*Paris/ })).toBeVisible();
  // A new key, then deleted
  await phone.getByRole('button', { name: 'Propriété', exact: true }).click();
  await phone.getByLabel('Nom de la propriété').fill('Plaque');
  await phone.getByRole('button', { name: 'Suivant' }).click();
  await phone.getByLabel('Plaque').fill('AB-123-CD');
  await phone.getByRole('button', { name: 'Enregistrer' }).click();
  await shot(phone, '07d-properties');
  await phone.getByRole('button', { name: /^Plaque\s*AB-123-CD/ }).click();
  await shot(phone, '07e-property-edit');
  await phone.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await phone.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(phone.getByRole('button', { name: /^Plaque/ })).toBeHidden();
  // A new key typed as a number
  await phone.getByRole('button', { name: 'Propriété', exact: true }).click();
  await phone.getByLabel('Nom de la propriété').fill('Montant');
  await phone.getByRole('button', { name: 'Suivant' }).click();
  await phone.getByRole('button', { name: 'Nombre', exact: true }).click();
  await shot(phone, '07f-property-type');
  await phone.getByLabel('Montant').fill('12,5');
  await phone.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(phone.getByRole('button', { name: /^Montant\s*12\.5/ })).toBeVisible();
  await expect.poll(async () => {
    const el = (await desktopState(desktop)).elements.find((e) => e.label === 'Note rapide');
    return el && { notes: el.notes, assets: el.assetIds.length, tags: el.tags, properties: el.properties.map((p) => [p.key, p.type ?? 'text', p.value]) };
  }, { timeout: 30_000 }).toEqual({ notes: 'Texte seul', assets: 0, tags: ['Témoin'], properties: [['ville', 'text', 'Paris'], ['Montant', 'number', 12.5]] });

  // A dated event from the field: it feeds the timeline, and the map with its position
  await phone.getByRole('button', { name: 'Ajouter un événement' }).click();
  await phone.getByLabel('Libellé').fill('Vu au dépôt');
  await phone.getByLabel('Date', { exact: true }).fill('2026-10-05');
  await phone.getByLabel('Heure').fill('14:30');
  await phone.getByLabel('Description').fill('Deux hommes, camion blanc');
  await phone.getByRole('button', { name: 'Ajouter ma position' }).click();
  await expect(phone.getByText('48.85660, 2.35220')).toBeVisible();
  await shot(phone, '07g-event');
  await phone.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(phone.getByText('Vu au dépôt')).toBeVisible();
  await expect.poll(async () => {
    const el = (await desktopState(desktop)).elements.find((e) => e.label === 'Note rapide');
    const ev = el?.events[0];
    return ev && { label: ev.label, at: new Date(ev.date as string | Date).getTime(), precision: ev.precision, geo: ev.geo, description: ev.description };
  }, { timeout: 30_000 }).toEqual({
    label: 'Vu au dépôt', at: new Date(2026, 9, 5, 14, 30).getTime(), precision: 'minute',
    geo: { type: 'point', lat: 48.8566, lng: 2.3522 }, description: 'Deux hommes, camion blanc',
  });
  // Edited, then deleted
  await phone.getByRole('button', { name: "Modifier l'événement" }).click();
  await phone.getByLabel('Libellé').fill('Vu au dépôt (2e fois)');
  await phone.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await desktopState(desktop)).elements.find((e) => e.label === 'Note rapide')?.events.map((e) => e.label), { timeout: 30_000 })
    .toEqual(['Vu au dépôt (2e fois)']);
  await phone.getByRole('button', { name: "Modifier l'événement" }).click();
  await phone.getByRole('button', { name: "Supprimer l'événement" }).click();
  await phone.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect.poll(async () => (await desktopState(desktop)).elements.find((e) => e.label === 'Note rapide')?.events.length, { timeout: 30_000 }).toBe(0);

  // A position placed by touching the map, then removed
  await phone.getByRole('button', { name: 'Placer sur la carte' }).click();
  const picker = phone.getByRole('dialog', { name: 'Choisir sur la carte' });
  await expect(picker.getByText('Touchez la carte')).toBeVisible({ timeout: 20_000 });
  await phone.waitForTimeout(1000);
  await picker.getByTestId('map-picker').click({ position: { x: 150, y: 200 } });
  await expect(picker.getByText(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/)).toBeVisible();
  await shot(phone, '07h-map-picker');
  await picker.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await desktopState(desktop)).elements.find((e) => e.label === 'Note rapide')?.geo?.type, { timeout: 30_000 })
    .toBe('point');
  await phone.getByRole('button', { name: 'Modifier la position' }).click();
  await phone.getByRole('dialog', { name: 'Choisir sur la carte' }).getByRole('button', { name: 'Retirer la position' }).click();
  await expect.poll(async () => (await desktopState(desktop)).elements.find((e) => e.label === 'Note rapide')?.geo ?? null, { timeout: 30_000 })
    .toBeNull();

  // ── Offline capture: pending, then delivered on reconnection ─────────────
  await phone.context().setOffline(true);
  await phone.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(phone.getByRole('button', { name: /Hors ligne|Reconnexion/ })).toBeVisible({ timeout: 40_000 });
  await phone.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await phone.getByLabel('Titre').fill('Capture hors réseau');
  await phone.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(phone.getByText('1 en attente')).toBeVisible();
  await shot(phone, '08-offline-pending');
  await phone.context().setOffline(false);
  await expect(phone.getByText('1 en attente')).toBeHidden({ timeout: 60_000 });
  await expect.poll(async () => (await desktopState(desktop)).labels, { timeout: 30_000 }).toContain('Capture hors réseau');

  // ── Settings, then forget ────────────────────────────────────────────────
  await phone.getByRole('button', { name: /^Réglages/ }).click();
  await shot(phone, '09-settings-dossier');
  // The app's own settings, apart from the dossier's: theme and language
  await phone.getByRole('tab', { name: 'Application' }).click();
  await phone.getByRole('button', { name: 'Sombre' }).click();
  await expect(phone.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot(phone, '09-settings');
  // Scrolled to the end, the page stops at its last section, no empty area under it
  const gap = await phone.evaluate(() => {
    const main = document.querySelector('main')!;
    main.scrollTop = main.scrollHeight;
    const last = main.querySelector('ul:last-of-type li:last-child')!;
    return Math.round(main.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom);
  });
  expect(gap).toBeLessThanOrEqual(24);
  await shot(phone, '09b-settings-end');
  await phone.getByRole('button', { name: 'Système' }).click();
  await expect(phone.locator('html')).toHaveAttribute('data-theme', 'light');
  await phone.getByLabel('Langue').selectOption('en');
  await expect(phone.getByRole('tab', { name: 'This dossier' })).toBeVisible();
  await phone.getByLabel('Language').selectOption('fr');
  await phone.getByRole('tab', { name: 'Ce dossier' }).click();
  await phone.getByRole('button', { name: 'Oublier ce dossier' }).click();
  await phone.getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(phone).toHaveURL(/\/m\/?$/);
  await shot(phone, '10-home-empty');
  await phone.getByRole('button', { name: 'Réglages' }).click();
  await expect(phone.getByLabel('Langue')).toBeVisible();
  await shot(phone, '10b-app-settings');
  await phone.getByRole('button', { name: 'Retour' }).click();
  await expect(phone).toHaveURL(/\/m\/?$/);
  // The link can be pasted from inside the page too (desktop /join/ form accepted)
  await phone.getByPlaceholder('Coller le lien de partage').fill(mobileUrl.replace('/m/', '/join/'));
  await phone.getByPlaceholder('Coller le lien de partage').press('Enter');
  await expect(phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' })).toBeVisible();
  const leftovers = await phone.evaluate(async () =>
    (await indexedDB.databases()).filter((d) => /^zeroneurone-(companion-)?ydoc-/.test(d.name ?? '')).length);
  expect(leftovers).toBe(0);
});

test('a capture made while every computer is off reaches the desktop later', async ({ browser }) => {
  // The relay hands a client coming back alone what was buffered while it
  // was away (relay/asyncBuffer.js): nothing else can deliver this capture.
  test.setTimeout(3 * 60 * 1000);

  // Desktop shares (async), the phone joins while it is online
  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(5));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await desktop.waitForTimeout(1500);
  const { mobileUrl, dossierId } = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Seul', true);
    const id = syncService.getDossierId()!;
    return { mobileUrl: await syncService.buildShareUrl(id, encryptionKey, 'Seul', true, 'm', undefined, true), dossierId: id };
  });
  const phone = await newPhone(browser);
  phonePage = phone;
  await phone.goto(mobileUrl);
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  await expect(phone.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });

  // The desktop goes away; the phone captures alone, then closes too
  const desktopContext = desktop.context();
  // As a closed tab does: announce the departure (Playwright skips
  // beforeunload by default, and the phone then waits ~30 s for the presence
  // to expire)
  await desktop.close({ runBeforeUnload: true });
  await expect(phone.getByRole('button', { name: /Connecté, 0 poste/ })).toBeVisible({ timeout: 45_000 });
  await phone.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await phone.getByLabel('Titre').fill('Capture sans poste');
  await phone.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(phone.locator('header span.truncate')).toHaveText('Capture sans poste');
  await expect(phone.getByText(/en attente/)).toBeHidden({ timeout: 30_000 });
  await phone.close();

  // The desktop comes back alone: the relay's buffer is all it can get it from
  const back = await desktopContext.newPage();
  await back.goto(`/dossier/${dossierId}`);
  await back.bringToFront();
  await expect.poll(async () => (await readDesktop(back)).labels.length, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await readDesktop(back)).labels, { timeout: 30_000 }).toContain('Capture sans poste');
});

test('in the browser holding the desktop copy, the companion keeps its own and forgets only it', async ({ browser }) => {
  test.setTimeout(3 * 60 * 1000);
  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'same-browser.json');
  writeFileSync(file, buildLargeDossierJson(5));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await desktop.waitForTimeout(1500);
  const { mobileUrl, dossierId } = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Même navigateur', true);
    const id = syncService.getDossierId()!;
    return { mobileUrl: await syncService.buildShareUrl(id, encryptionKey, 'Même navigateur', true, 'm', undefined, true), dossierId: id };
  });
  const desktopCopy = `zeroneurone-ydoc-${dossierId}`;
  const companionCopy = `zeroneurone-companion-ydoc-${dossierId}`;
  const databases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));

  // The companion opened in the same browser as the desktop (in its language: English)
  const companion = await desktop.context().newPage();
  phonePage = companion;
  await companion.goto(mobileUrl);
  await companion.getByRole('button', { name: 'Open on this phone' }).click();
  await expect(companion.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await databases(companion)).toEqual(expect.arrayContaining([desktopCopy, companionCopy]));

  await companion.getByRole('button', { name: /^Settings/ }).click();
  await companion.getByRole('button', { name: 'Forget this dossier' }).click();
  await companion.getByRole('button', { name: 'Erase', exact: true }).click();
  await expect(companion).toHaveURL(/\/m\/?$/, { timeout: 15_000 });

  // Only the companion's copy is gone: the desktop's is intact
  await expect.poll(async () => databases(companion), { timeout: 15_000 }).not.toContain(companionCopy);
  expect(await databases(companion)).toContain(desktopCopy);
  await companion.close();
  phonePage = null;
  await desktop.bringToFront();
  await desktop.reload();
  await desktop.goto(`/dossier/${dossierId}`);
  await expect(desktop.locator('.react-flow__node').first()).toBeVisible({ timeout: 30_000 });
  expect((await readDesktop(desktop)).labels).toContain('Jean Dupont 0');
});

test('something shared from another app becomes a capture in the dossier', async ({ browser }) => {
  test.setTimeout(3 * 60 * 1000);
  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'share.json');
  writeFileSync(file, buildLargeDossierJson(5));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await desktop.waitForTimeout(1500);
  const mobileUrl = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Partage', true);
    return syncService.buildShareUrl(syncService.getDossierId()!, encryptionKey, 'Partage', true, 'm', undefined, true);
  });
  const phone = await newPhone(browser);
  phonePage = phone;
  await phone.goto(mobileUrl);
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  await expect(phone.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });

  // What the service worker keeps when Android shares to the companion
  // (public/share-target-sw.js, tested on its own in shareInbox.test.ts)
  const png = await import('node:fs').then((fs) => fs.readFileSync('public/logo-192.png').toString('base64'));
  await phone.evaluate(async (data) => {
    const { keepShare } = await import('/src/companion/shareInbox.ts');
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    await keepShare({
      id: 'share-1', title: 'Annonce suspecte', text: 'https://example.org/annonce', url: '',
      files: [{ name: 'capture.png', type: 'image/png', blob: new Blob([bytes], { type: 'image/png' }) }],
      createdAt: Date.now(),
    });
  }, png);
  await phone.goto(new URL('/m/share?id=share-1', phone.url()).toString());

  // One dossier on the phone: straight to its capture form, filled
  await expect(phone.getByLabel('Titre')).toHaveValue('Annonce suspecte', { timeout: 30_000 });
  await expect(phone.getByLabel('Source', { exact: true })).toHaveValue('https://example.org/annonce');
  await expect(phone.locator('main ul img')).toHaveCount(1);
  await shot(phone, '11-shared');
  await phone.getByRole('button', { name: 'Ajouter au dossier' }).click();

  await expect.poll(async () => {
    const st = await desktopState(desktop);
    const el = st.elements.find((e) => e.label === 'Annonce suspecte');
    return el ? { source: el.source, assets: el.assetIds.length } : null;
  }, { timeout: 30_000 }).toEqual({ source: 'https://example.org/annonce', assets: 1 });
  // Used: the share is gone from the phone
  expect(await phone.evaluate(async () => (await import('/src/companion/shareInbox.ts')).readShare('share-1'))).toBeNull();
});

test('the lock: the phone\'s passkey encrypts what it keeps, and opens it again', async ({ browser }) => {
  test.setTimeout(4 * 60 * 1000);
  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'lock.json');
  writeFileSync(file, buildLargeDossierJson(5));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await desktop.waitForTimeout(1500);
  const { mobileUrl, shareKey, dossierId } = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Verrou', true);
    const id = syncService.getDossierId()!;
    return { mobileUrl: await syncService.buildShareUrl(id, encryptionKey, 'Verrou', true, 'm', undefined, true), shareKey: encryptionKey, dossierId: id };
  });
  const phone = await newPhone(browser);
  phonePage = phone;
  // A passkey of the phone itself, with PRF (Face ID / fingerprint stand-in)
  const cdp = await phone.context().newCDPSession(phone);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
  });
  await phone.goto(mobileUrl);
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  await expect(phone.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });

  const companionCopy = `zeroneurone-companion-ydoc-${dossierId}`;
  const stored = () => phone.evaluate(async (name) => {
    const { readStoredUpdates } = await import('/src/services/encryption/encryptedIndexeddbPersistence.ts');
    const { updates, undecryptable } = await readStoredUpdates(name, null);
    return { plain: updates.length, encrypted: undecryptable };
  }, companionCopy);

  // An offline capture still pending when the lock goes on
  await phone.context().setOffline(true);
  await phone.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(phone.getByRole('button', { name: /Hors ligne|Reconnexion/ })).toBeVisible({ timeout: 40_000 });
  await phone.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await phone.getByLabel('Titre').fill('Avant verrouillage');
  await phone.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(phone.getByText('1 en attente')).toBeVisible();
  // A copy left in plain under the former database name (companion before 2.93.3)
  await phone.evaluate(async ({ from, to }) => {
    const open = (name: string) => new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open(name);
      req.onupgradeneeded = () => { req.result.createObjectStore('updates', { autoIncrement: true }); req.result.createObjectStore('custom'); };
      req.onsuccess = () => resolve(req.result);
    });
    const source = await open(from);
    const updates = await new Promise<unknown[]>((resolve) => {
      const req = source.transaction('updates').objectStore('updates').getAll();
      req.onsuccess = () => resolve(req.result);
    });
    source.close();
    const target = await open(to);
    await new Promise<void>((resolve) => {
      const tx = target.transaction('updates', 'readwrite');
      for (const u of updates) tx.objectStore('updates').add(u);
      tx.oncomplete = () => resolve();
    });
    target.close();
  }, { from: `zeroneurone-companion-ydoc-${dossierId}`, to: `zeroneurone-ydoc-${dossierId}` });

  // ── Turned on from the app settings ─────────────────────────────────────
  await phone.getByRole('button', { name: /^Réglages/ }).click();
  await phone.getByRole('tab', { name: 'Application' }).click();
  await phone.getByRole('button', { name: 'Verrouiller avec le téléphone' }).click();
  await expect(phone).toHaveURL(/\/m\/?$/, { timeout: 30_000 });
  expect(await phone.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(shareKey);
  expect(await stored()).toMatchObject({ plain: 0 });
  expect((await stored()).encrypted).toBeGreaterThan(0);
  // No plain copy anywhere: the former-name one brought over, then erased
  expect(await phone.evaluate(async () => {
    const { readStoredUpdates } = await import('/src/services/encryption/encryptedIndexeddbPersistence.ts');
    const names = (await indexedDB.databases()).map((d) => d.name ?? '').filter((n) => /^zeroneurone-(companion-)?ydoc-/.test(n));
    let plain = 0;
    for (const n of names) plain += (await readStoredUpdates(n, null)).updates.length;
    return { names: names.length, plain };
  })).toEqual({ names: 1, plain: 0 });

  // ── Relaunched: locked, nothing of the dossier shown ────────────────────
  // Back online (the dev server has no service worker to reload offline); no
  // dossier open, so the capture stays pending until the dossier reopens
  await phone.context().setOffline(false);
  await phone.reload();
  await expect(phone.getByRole('button', { name: 'Déverrouiller' })).toBeVisible();
  await expect(phone.getByText('lock', { exact: true })).toHaveCount(0);
  await shot(phone, '12-locked');
  await phone.getByRole('button', { name: 'Déverrouiller' }).click();
  await phone.getByRole('button', { name: /^lock/ }).click();
  await expect(phone.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });
  // Still syncing, encrypted at rest
  await desktop.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    await d.createElement('Après verrouillage', { x: 0, y: 900 });
  });
  await phone.bringToFront();
  await expect(phone.getByText('Après verrouillage')).toBeVisible({ timeout: 30_000 });
  expect((await stored()).plain).toBe(0);
  // The capture pending since before the lock, then one written locked, reach the desktop
  await expect(phone.getByText('1 en attente')).toBeHidden({ timeout: 60_000 });
  await phone.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await phone.getByLabel('Titre').fill('Écrit verrouillé');
  await phone.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect.poll(async () => (await desktopState(desktop)).labels, { timeout: 30_000 })
    .toEqual(expect.arrayContaining(['Avant verrouillage', 'Écrit verrouillé']));
  expect((await stored()).plain).toBe(0);

  // ── Back from the background past the delay: covered, the page kept ─────
  await phone.getByRole('button', { name: /^Réglages/ }).click();
  await phone.getByRole('tab', { name: 'Application' }).click();
  await phone.getByLabel('Délai').selectOption('0');
  await expect(phone).toHaveURL(/\/m\/d\//);
  const visibility = (state: 'hidden' | 'visible') => phone.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
  await visibility('hidden');
  await visibility('visible');
  await expect(phone.getByRole('dialog', { name: 'Verrouillage' })).toBeVisible();
  await phone.getByRole('button', { name: 'Déverrouiller' }).click();
  await expect(phone.getByRole('dialog', { name: 'Verrouillage' })).toBeHidden();
  await expect(phone.getByLabel('Délai')).toBeVisible();

  // ── Turned off: everything back in plain ─────────────────────────────────
  await phone.getByRole('button', { name: 'Désactiver le verrouillage' }).click();
  await phone.getByRole('button', { name: 'Désactiver le verrouillage' }).click();
  await expect(phone).toHaveURL(/\/m\/?$/, { timeout: 30_000 });
  expect(await stored()).toMatchObject({ encrypted: 0 });
  expect(await phone.evaluate(() => JSON.stringify({ ...localStorage }))).toContain(shareKey);

  // ── Passkey lost: "Forget everything" without it ────────────────────────
  await phone.getByRole('button', { name: 'Réglages' }).click();
  await phone.getByRole('button', { name: 'Verrouiller avec le téléphone' }).click();
  await expect(phone.getByLabel('Délai')).toBeVisible({ timeout: 30_000 });
  await phone.goto(new URL('/m/', phone.url()).toString());
  await cdp.send('WebAuthn.clearCredentials', { authenticatorId });
  await phone.getByRole('button', { name: 'Déverrouiller' }).click();
  await expect(phone.getByText('Échec, réessayez')).toBeVisible({ timeout: 30_000 });
  await phone.getByRole('button', { name: 'Effacer les dossiers ZeroNeurone' }).click();
  await expect(phone.getByText('Effacer 1 dossier de ce téléphone ? Il reste sur les postes.')).toBeVisible();
  await phone.getByRole('button', { name: 'Effacer les dossiers ZeroNeurone' }).click();
  await expect(phone.getByText('Scannez le QR code de partage ou collez le lien.')).toBeVisible({ timeout: 30_000 });
  expect(await phone.evaluate(async (name) => (await indexedDB.databases()).some((d) => d.name === name), companionCopy)).toBe(false);
  expect(await phone.evaluate(() => localStorage.getItem('zeroneurone-companion-lock'))).toBeNull();
});

test('a phone relaunched (app closed, reopened) syncs again both ways', async ({ browser }) => {
  test.setTimeout(3 * 60 * 1000);
  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'relaunch.json');
  writeFileSync(file, buildLargeDossierJson(5));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await desktop.waitForTimeout(1500);
  const mobileUrl = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Relance', true);
    return syncService.buildShareUrl(syncService.getDossierId()!, encryptionKey, 'Relance', true, 'm', undefined, true);
  });
  const phone = await newPhone(browser);
  phonePage = phone;
  await phone.goto(mobileUrl);
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  await expect(phone.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });
  const dossierUrl = phone.url();

  // The app is closed (tab gone), then opened again from its address
  const phoneContext = phone.context();
  await phone.close({ runBeforeUnload: true });
  const again = await phoneContext.newPage();
  phonePage = again;
  await again.goto(dossierUrl);
  await expect(again.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });

  // Desktop → phone
  await desktop.bringToFront();
  await desktop.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    await d.createElement('Ajout après relance', { x: 0, y: 900 });
  });
  await again.bringToFront();
  await expect(again.getByText('Ajout après relance')).toBeVisible({ timeout: 30_000 });

  // Phone → desktop
  await again.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await again.getByLabel('Titre').fill('Capture après relance');
  await again.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect.poll(async () => (await desktopState(desktop)).labels, { timeout: 30_000 }).toContain('Capture après relance');
});

test('presence replayed from the relay buffer is not taken for a computer online', async ({ browser }) => {
  test.setTimeout(3 * 60 * 1000);
  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'ghost.json');
  writeFileSync(file, buildLargeDossierJson(3));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  const mobileUrl = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Fantôme', true);
    return syncService.buildShareUrl(syncService.getDossierId()!, encryptionKey, 'Fantôme', true, 'm', undefined, true);
  });
  // Alone in the room: its presence heartbeats (every 10 s) go to the buffer
  await desktop.waitForTimeout(12_000);
  await desktop.close({ runBeforeUnload: true });

  // A phone that never had the dossier joins while no computer is online
  const phone = await newPhone(browser);
  phonePage = phone;
  await phone.goto(mobileUrl);
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  await expect(phone.getByText("En attente d'un poste en ligne")).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByRole('button', { name: /Connecté, 0 poste/ })).toBeVisible();
});

test('a local copy that cannot be opened says so, and the dossier can still be forgotten', async ({ browser }) => {
  test.setTimeout(3 * 60 * 1000);
  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'blocked.json');
  writeFileSync(file, buildLargeDossierJson(3));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  const { mobileUrl, dossierId } = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Bloqué', true);
    const id = syncService.getDossierId()!;
    return { mobileUrl: await syncService.buildShareUrl(id, encryptionKey, 'Bloqué', true, 'm', undefined, true), dossierId: id };
  });
  const phone = await newPhone(browser);
  phonePage = phone;
  await phone.goto(mobileUrl);
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  await expect(phone.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });
  const dossierUrl = phone.url();
  const context = phone.context();
  await phone.close({ runBeforeUnload: true });

  // Another page holds the database and ignores the request to close it; a
  // deletion then waits for it, and every later open waits behind the deletion
  const holder = await context.newPage();
  await holder.goto(new URL('/m/', dossierUrl).toString());
  await holder.evaluate((name) => new Promise<void>((resolve) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      (window as unknown as { held: IDBDatabase }).held = req.result;
      indexedDB.deleteDatabase(name);
      resolve();
    };
  }), `zeroneurone-companion-ydoc-${dossierId}`);

  const again = await context.newPage();
  phonePage = again;
  await again.goto(dossierUrl);
  await expect(again.getByText('Ouverture impossible')).toBeVisible({ timeout: 30_000 });
  await expect(again.getByRole('button', { name: 'Réessayer' })).toBeVisible();

  // Forgetting does not wait on the open that never answers
  await again.getByRole('button', { name: /^Réglages/ }).click();
  await again.getByRole('button', { name: 'Oublier ce dossier' }).click();
  await again.getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(again).toHaveURL(/\/m\/?$/, { timeout: 15_000 });
  await expect(again.getByText('Scannez le QR code de partage ou collez le lien.')).toBeVisible();

  // The copy could not be erased: said so, not hidden, and retried once free
  await expect(again.getByText("Copie d'un dossier oublié encore sur ce téléphone")).toBeVisible();
  await holder.evaluate(() => (window as unknown as { held: IDBDatabase }).held.close());
  // The erasure retried on arrival goes through once the database is free
  await expect(again.getByText("Copie d'un dossier oublié encore sur ce téléphone")).toBeHidden({ timeout: 20_000 });
  const left = await again.evaluate(async (name) => (await indexedDB.databases()).some((d) => d.name === name), `zeroneurone-companion-ydoc-${dossierId}`);
  expect(left).toBe(false);
});

test('a file added on a computer opens on the phone on demand, then from its cache', async ({ browser }) => {
  // Shared files' bytes go to the files document, which the phone does not
  // sync: the phone asks the computers online (fileRequests.ts) and keeps
  // what it got for 5 days (fileCache.ts)
  test.setTimeout(3 * 60 * 1000);

  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(5));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await desktop.waitForTimeout(1500);
  const mobileUrl = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Fichiers', true);
    return syncService.buildShareUrl(syncService.getDossierId()!, encryptionKey, 'Fichiers', true, 'm', undefined, true);
  });

  // Two files on the computer: a photo opened while it is online, a PDF after it left
  await desktop.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    const d = useDossierStore.getState();
    const el = d.elements.find((e) => e.label === 'Jean Dupont 0')!;
    const canvas = new OffscreenCanvas(640, 480);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e07a5f';
    ctx.fillRect(0, 0, 640, 480);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    await d.addAsset(el.id, new File([png], 'terrain.png', { type: 'image/png' }));
    const pdf = '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + 'x'.repeat(700_000);
    await useDossierStore.getState().addAsset(el.id, new File([pdf], 'rapport.pdf', { type: 'application/pdf' }));
  });

  const phone = await newPhone(browser);
  phonePage = phone;
  await phone.goto(mobileUrl);
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  await phone.getByRole('button', { name: /^Jean Dupont 0/ }).click();
  const photo = phone.getByRole('button', { name: 'terrain.png' });
  await expect(photo).toBeVisible({ timeout: 30_000 });
  await expect(phone.getByRole('button', { name: /Connecté, 1 poste/ })).toBeVisible({ timeout: 30_000 });

  // Only metadata and thumbnails reached the phone: its copy stays far below
  // the PDF alone (700 KB), the desktop's files document holds the bytes
  await phone.waitForTimeout(1500);
  const phoneCopy = await ydocStorage(phone, 'zeroneurone-companion-ydoc-');
  expect(phoneCopy).toHaveLength(1);
  expect(phoneCopy[0].bytes).toBeLessThan(200_000);

  // Opened: asked to the computer, shown full screen
  await photo.click();
  const full = phone.locator('img[alt="terrain.png"][src^="blob:"]');
  await expect(full).toBeVisible({ timeout: 30_000 });
  await full.click();
  await expect(full).toBeHidden();

  // The computer leaves: the photo opens from the cache, the PDF waits for a computer
  await desktop.close({ runBeforeUnload: true });
  await expect(phone.getByRole('button', { name: /Connecté, 0 poste/ })).toBeVisible({ timeout: 45_000 });
  await photo.click();
  await expect(full).toBeVisible({ timeout: 10_000 });
  await full.click();
  await expect(full).toBeHidden();
  await phone.getByRole('button', { name: 'rapport.pdf' }).click();
  await expect(phone.getByText('Disponible quand un poste est en ligne')).toBeVisible({ timeout: 10_000 });
});

test('a phone with a read link sees the dossier and changes nothing', async ({ browser }) => {
  test.setTimeout(3 * 60 * 1000);
  const desktop = await newDesktop(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-companion-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(5));
  await desktop.click('[data-testid="import-button"]');
  await desktop.setInputFiles('input[type="file"]', file);
  await desktop.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await desktop.waitForTimeout(1500);
  const readUrl = await desktop.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const { encryptionKey } = await useSyncStore.getState().share('Consultation', true);
    const access = syncService.getWriteAccess()!;
    return syncService.buildShareUrl(syncService.getDossierId()!, encryptionKey, 'Consultation', true, 'm', { publicKey: access.publicKey });
  });
  expect(readUrl).toContain('wpub=');
  expect(readUrl).not.toContain('wseed=');

  const phone = await newPhone(browser);
  phonePage = phone;
  await phone.goto(readUrl);
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  await expect(phone.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(phone.getByText('Lecture seule', { exact: true })).toBeVisible();
  // The desktop sees the phone, marked as a reader
  await desktop.bringToFront();
  await expect(desktop.locator('[data-reader="true"]')).toHaveCount(1, { timeout: 30_000 });

  // The desktop's changes arrive
  await desktop.bringToFront();
  await desktop.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    await useDossierStore.getState().createElement('Ajout du poste', { x: 0, y: 0 });
  });
  await phone.bringToFront();
  await expect(phone.getByText('Ajout du poste', { exact: true })).toBeVisible({ timeout: 30_000 });

  // Nothing to change: no capture, no editing, no comment
  await phone.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await expect(phone.getByRole('button', { name: 'Ajouter au dossier' })).toHaveCount(0);
  await phone.getByRole('button', { name: 'Éléments', exact: true }).click();
  await phone.getByText('Jean Dupont 0', { exact: true }).click();
  await expect(phone.getByRole('button', { name: 'Supprimer l\'élément' })).toHaveCount(0);
  await expect(phone.getByPlaceholder('Commentaire')).toHaveCount(0);
});
