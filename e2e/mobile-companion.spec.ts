import { test, expect, devices, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import { setupCleanEnvironment } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

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
      elements: d.elements.map((e) => ({ id: e.id, label: e.label, notes: e.notes, geo: e.geo, assetIds: e.assetIds, properties: e.properties, source: e.source, date: e.date })),
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
    return syncService.buildShareUrl(id, encryptionKey, 'Terrain', syncService.isAsync(), 'm');
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

  // Deletion, confirmed: the link to Garage Martin, then Garage Martin itself
  const garageRow = phone.getByRole('listitem').filter({ hasText: 'Garage Martin' });
  await garageRow.getByRole('button', { name: 'Supprimer le lien' }).click();
  await phone.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(garageRow).toHaveCount(0);
  await expect.poll(async () => (await readLinks(desktop)).some((l) => l.to === 'Garage Martin'), { timeout: 20_000 }).toBe(false);
  await phone.getByPlaceholder('Rechercher').fill('Garage Martin');
  await phone.getByRole('button', { name: /^Garage Martin/ }).first().click();
  await phone.getByRole('button', { name: "Supprimer l'élément" }).click();
  await expect(phone.getByText('Supprimer « Garage Martin » ?')).toBeVisible();
  await shot(phone, '04g-delete-confirm');
  await phone.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect.poll(async () => (await desktopState(desktop)).labels, { timeout: 20_000 }).not.toContain('Garage Martin');
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
  await expect(phone.getByRole('button', { name: `Retirer l'étiquette ${sophieTag}` })).toBeVisible();
  await expect(phone.getByRole('button', { name: new RegExp(`^${sophie}`) })).toBeVisible();
  await phone.getByRole('button', { name: `Retirer l'étiquette ${sophieTag}` }).click();
  await phone.getByPlaceholder('Rechercher').fill('#tag-1');
  await expect(phone.getByRole('button', { name: /^tag-1\b/ }).first()).toBeVisible();
  await shot(phone, '04j-tag-suggest');
  await phone.getByRole('button', { name: /^tag-1\s/ }).first().click();
  await expect(phone.getByRole('button', { name: /^Retirer l'étiquette tag-1/ })).toBeVisible();
  await phone.getByRole('button', { name: /^Retirer l'étiquette tag-1/ }).click();

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
  await shot(phone, '04d-timeline');
  await phone.getByText('Ouverture du compte').click();
  await expect(phone.locator('header span.truncate')).toHaveText(eventOwner);
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
  await phone.getByRole('button', { name: 'Capturer' }).click();
  await phone.getByLabel('Titre').fill('Véhicule suspect');
  await phone.getByLabel('Note').fill('Garé devant le n° 12');
  await phone.getByLabel('Source', { exact: true }).fill('Témoin rue Haute');
  await phone.locator('input[type="file"]').setInputFiles('public/logo-512.png');
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
    return !!el && el.assetIds.length === 1 && s.assets.some((a) => a.id === el.assetIds[0] && a.thumb);
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

  // ── Offline capture: pending, then delivered on reconnection ─────────────
  await phone.context().setOffline(true);
  await phone.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(phone.getByRole('button', { name: /Hors ligne|Reconnexion/ })).toBeVisible({ timeout: 40_000 });
  await phone.getByRole('button', { name: 'Capturer' }).click();
  await phone.getByLabel('Titre').fill('Capture hors réseau');
  await phone.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(phone.getByText('1 en attente')).toBeVisible();
  await shot(phone, '08-offline-pending');
  await phone.context().setOffline(false);
  await expect(phone.getByText('1 en attente')).toBeHidden({ timeout: 60_000 });
  await expect.poll(async () => (await desktopState(desktop)).labels, { timeout: 30_000 }).toContain('Capture hors réseau');

  // ── Settings, then forget ────────────────────────────────────────────────
  await phone.getByRole('button', { name: /^Réglages/ }).click();
  await shot(phone, '09-settings');
  await phone.getByRole('button', { name: 'Oublier ce dossier' }).click();
  await phone.getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(phone).toHaveURL(/\/m\/?$/);
  await shot(phone, '10-home-empty');
  // The link can be pasted from inside the page too (desktop /join/ form accepted)
  await phone.getByPlaceholder('Coller le lien de partage').fill(mobileUrl.replace('/m/', '/join/'));
  await phone.getByPlaceholder('Coller le lien de partage').press('Enter');
  await expect(phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' })).toBeVisible();
  const leftovers = await phone.evaluate(async () =>
    (await indexedDB.databases()).filter((d) => d.name?.startsWith('zeroneurone-ydoc-')).length);
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
    return { mobileUrl: await syncService.buildShareUrl(id, encryptionKey, 'Seul', true, 'm'), dossierId: id };
  });
  const phone = await newPhone(browser);
  phonePage = phone;
  await phone.goto(mobileUrl);
  await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
  await expect(phone.getByText('Jean Dupont 0', { exact: true })).toBeVisible({ timeout: 30_000 });

  // The desktop goes away; the phone captures alone, then closes too
  const desktopContext = desktop.context();
  await desktop.close();
  await expect(phone.getByRole('button', { name: /Connecté, 0 poste/ })).toBeVisible({ timeout: 30_000 });
  await phone.getByRole('button', { name: 'Capturer' }).click();
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
