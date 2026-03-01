/**
 * Tests E2E — Chiffrement at-rest
 *
 * Couvre :
 * 1. Activation du chiffrement (happy path + mot de passe trop court)
 * 2. Verrouillage de session + unlock (mot de passe correct)
 * 3. Unlock avec mot de passe incorrect → message d'erreur
 * 4. Changement de mot de passe
 * 5. Désactivation du chiffrement
 * 6. Données lisibles après unlock
 *
 * Chaque test part d'un contexte vierge (IndexedDB effacée).
 * Le webServer vite doit être en marche (playwright.config.ts gère ça).
 */

import { test, expect, type Page } from '@playwright/test';
import { setupCleanEnvironment } from './fixtures/test-utils';

const TEST_PASSWORD = 'MotDePasse123!';
const NEW_PASSWORD = 'NouveauMotDePasse456!';
const WRONG_PASSWORD = 'MauvaisMotDePasse';

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

async function openEncryptionModal(page: Page) {
  await page.click('[data-testid="encryption-settings-button"]');
  await page.waitForSelector('[data-testid="encryption-status"]');
}

async function closeModal(page: Page) {
  await page.keyboard.press('Escape');
}

/**
 * Active le chiffrement depuis la vue principale de la modale.
 * Suppose que la modale est déjà ouverte.
 *
 * Après l'activation, enableEncryption() appelle window.location.reload()
 * pour que Dexie réouvre avec le middleware depuis le début.
 * Ce helper gère donc le cycle complet :
 *   1. Soumettre le formulaire d'activation
 *   2. Attendre le rechargement automatique de la page
 *   3. Déverrouiller depuis la PasswordModal (qui apparaît au redémarrage)
 *   4. Ré-ouvrir la modale de chiffrement (pour que les assertions suivantes fonctionnent)
 */
async function enableEncryptionFlow(page: Page, password: string) {
  await page.click('[data-testid="enable-encryption-button"]');
  await page.fill('[data-testid="enable-password-input"]', password);
  await page.fill('[data-testid="enable-password-confirm-input"]', password);
  await page.click('[data-testid="enable-confirm-button"]');

  // enableEncryption() → window.location.reload() → attendre le rechargement
  await page.waitForLoadState('load', { timeout: 30_000 });

  // Après rechargement, EncryptionGate trouve _encryptionMeta → PasswordModal
  await unlockFromPasswordModal(page, password);

  // Attendre que l'app soit déverrouillée et accessible
  await page.waitForSelector(
    '[data-testid="landing-section"], [data-testid="dossier-list"]',
    { timeout: 15_000 }
  );

  // Ré-ouvrir la modale pour que les tests puissent interagir avec encryption-status
  await openEncryptionModal(page);
}

/**
 * Déverrouille une session depuis la PasswordModal bloquante.
 */
async function unlockFromPasswordModal(page: Page, password: string) {
  await page.waitForSelector('[data-testid="unlock-password-input"]', { timeout: 10_000 });
  await page.fill('[data-testid="unlock-password-input"]', password);
  await page.click('[data-testid="unlock-submit-button"]');
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

test.describe('Chiffrement at-rest', () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanEnvironment(page);
  });

  // =========================================================================
  // 1. Activation
  // =========================================================================

  test('activer le chiffrement — happy path', async ({ page }) => {
    await openEncryptionModal(page);

    // L'état initial doit être désactivé
    const status = page.locator('[data-testid="encryption-status"]');
    await expect(status).toHaveAttribute('data-encryption-enabled', 'false');

    await enableEncryptionFlow(page, TEST_PASSWORD);

    // Après migration, le statut doit passer à ON
    await expect(status).toHaveAttribute('data-encryption-enabled', 'true');
    // Le bouton "Désactiver" doit être présent
    await expect(page.locator('[data-testid="disable-encryption-button"]')).toBeVisible();
  });

  test('activer le chiffrement — mot de passe trop court bloque le submit', async ({ page }) => {
    await openEncryptionModal(page);
    await page.click('[data-testid="enable-encryption-button"]');

    await page.fill('[data-testid="enable-password-input"]', 'court');
    await page.fill('[data-testid="enable-password-confirm-input"]', 'court');

    // Le bouton doit être désactivé (mot de passe < 8 chars)
    await expect(page.locator('[data-testid="enable-confirm-button"]')).toBeDisabled();
  });

  test('activer le chiffrement — mots de passe discordants bloque le submit', async ({ page }) => {
    await openEncryptionModal(page);
    await page.click('[data-testid="enable-encryption-button"]');

    await page.fill('[data-testid="enable-password-input"]', TEST_PASSWORD);
    await page.fill('[data-testid="enable-password-confirm-input"]', TEST_PASSWORD + '_diff');

    await expect(page.locator('[data-testid="enable-confirm-button"]')).toBeDisabled();
  });

  // =========================================================================
  // 2. Verrouillage + unlock correct
  // =========================================================================

  test('verrouiller la session et déverrouiller avec le bon mot de passe', async ({ page }) => {
    // Activer le chiffrement
    await openEncryptionModal(page);
    await enableEncryptionFlow(page, TEST_PASSWORD);

    // Verrouiller la session
    await page.click('[data-testid="lock-session-button"]');

    // La PasswordModal doit apparaître après reload
    // (lock ferme la modale ; l'app montre la PasswordModal au prochain rendu)
    await page.reload();
    await unlockFromPasswordModal(page, TEST_PASSWORD);

    // L'app doit être accessible (landing ou liste dossiers)
    await page.waitForSelector('[data-testid="landing-section"], [data-testid="dossier-list"]', {
      timeout: 15_000,
    });
  });

  // =========================================================================
  // 3. Unlock avec mauvais mot de passe
  // =========================================================================

  test('unlock avec mot de passe incorrect affiche une erreur', async ({ page }) => {
    // Activer le chiffrement puis verrouiller
    await openEncryptionModal(page);
    await enableEncryptionFlow(page, TEST_PASSWORD);
    await page.reload(); // La PasswordModal apparaît au rechargement

    // Saisir le mauvais mot de passe
    await page.waitForSelector('[data-testid="unlock-password-input"]', { timeout: 10_000 });
    await page.fill('[data-testid="unlock-password-input"]', WRONG_PASSWORD);
    await page.click('[data-testid="unlock-submit-button"]');

    // Un message d'erreur doit s'afficher
    await expect(page.locator('[role="dialog"] .text-error, [aria-modal] .text-error'))
      .toBeVisible({ timeout: 10_000 });

    // La PasswordModal doit toujours être là
    await expect(page.locator('[data-testid="unlock-password-input"]')).toBeVisible();
  });

  // =========================================================================
  // 4. Changement de mot de passe
  // =========================================================================

  test('changer le mot de passe', async ({ page }) => {
    // Activer le chiffrement
    await openEncryptionModal(page);
    await enableEncryptionFlow(page, TEST_PASSWORD);

    // Changer le mot de passe
    await page.click('[data-testid="change-password-button"]');
    await page.fill('[data-testid="change-old-password-input"]', TEST_PASSWORD);
    await page.fill('[data-testid="change-new-password-input"]', NEW_PASSWORD);
    await page.fill('[data-testid="change-new-password-confirm-input"]', NEW_PASSWORD);
    await page.click('[data-testid="change-password-confirm-button"]');

    // Doit retourner à la vue principale avec succès
    await page.waitForSelector('[data-testid="encryption-status"]', { timeout: 10_000 });

    // Vérifier que le nouveau mot de passe fonctionne : recharger et unlock
    await page.reload();
    await unlockFromPasswordModal(page, NEW_PASSWORD);
    await page.waitForSelector('[data-testid="landing-section"], [data-testid="dossier-list"]', {
      timeout: 15_000,
    });
  });

  test('changer le mot de passe — ancien mot de passe incorrect affiche une erreur', async ({ page }) => {
    await openEncryptionModal(page);
    await enableEncryptionFlow(page, TEST_PASSWORD);

    await page.click('[data-testid="change-password-button"]');
    await page.fill('[data-testid="change-old-password-input"]', WRONG_PASSWORD);
    await page.fill('[data-testid="change-new-password-input"]', NEW_PASSWORD);
    await page.fill('[data-testid="change-new-password-confirm-input"]', NEW_PASSWORD);
    await page.click('[data-testid="change-password-confirm-button"]');

    // Un message d'erreur doit s'afficher dans la vue change-password
    await expect(page.locator('[data-testid="change-old-password-input"]')).toBeVisible();
    await expect(page.locator('.text-error').first()).toBeVisible({ timeout: 5_000 });
  });

  // =========================================================================
  // 5. Désactivation du chiffrement
  // =========================================================================

  test('désactiver le chiffrement', async ({ page }) => {
    // Activer le chiffrement
    await openEncryptionModal(page);
    await enableEncryptionFlow(page, TEST_PASSWORD);

    // Désactiver
    await page.click('[data-testid="disable-encryption-button"]');
    await page.fill('[data-testid="disable-password-input"]', TEST_PASSWORD);
    await page.click('[data-testid="disable-confirm-button"]');

    // L'app se rechargera automatiquement (setTimeout 1500ms dans DisableView)
    // Attendre le rechargement
    await page.waitForLoadState('load', { timeout: 15_000 });
    await page.waitForSelector('[data-testid="landing-section"], [data-testid="dossier-list"]', {
      timeout: 15_000,
    });

    // Aucune PasswordModal — le chiffrement est désactivé
    await expect(page.locator('[data-testid="unlock-password-input"]')).not.toBeVisible();

    // Vérifier que le statut est bien OFF
    await openEncryptionModal(page);
    await expect(page.locator('[data-testid="encryption-status"]')).toHaveAttribute(
      'data-encryption-enabled',
      'false'
    );
  });

  test('désactiver le chiffrement — mauvais mot de passe bloque', async ({ page }) => {
    await openEncryptionModal(page);
    await enableEncryptionFlow(page, TEST_PASSWORD);

    await page.click('[data-testid="disable-encryption-button"]');
    await page.fill('[data-testid="disable-password-input"]', WRONG_PASSWORD);
    await page.click('[data-testid="disable-confirm-button"]');

    // Erreur et la modale doit rester dans la vue disable
    await expect(page.locator('[data-testid="disable-password-input"]')).toBeVisible();
    await expect(page.locator('.text-error').first()).toBeVisible({ timeout: 5_000 });
  });

  // =========================================================================
  // 6. Données lisibles après cycle activation → lock → unlock
  // =========================================================================

  test('les données créées avant lock sont accessibles après unlock', async ({ page }) => {
    const { createTestDossier } = await import('./fixtures/test-utils');

    // Créer une dossier en clair
    await createTestDossier(page, 'Dossier Test Chiffrement');

    // Retourner à l'accueil via navigation
    await page.goto('/');
    await page.waitForSelector('[data-testid="landing-section"], [data-testid="dossier-list"]', {
      timeout: 15_000,
    });

    // Activer le chiffrement (migre les données existantes)
    await openEncryptionModal(page);
    await enableEncryptionFlow(page, TEST_PASSWORD);
    await closeModal(page);

    // Recharger → PasswordModal
    await page.reload();
    await unlockFromPasswordModal(page, TEST_PASSWORD);

    // Attendre que l'app soit déverrouillée
    await page.waitForSelector(
      '[data-testid="landing-section"], [data-testid="dossier-list"]',
      { timeout: 15_000 }
    );

    // Si la landing section est affichée (viewMode initial = 'landing'),
    // naviguer vers la liste des dossiers via le lien affiché
    const viewLink = page.locator('[data-testid="view-dossiers-link"]');
    if (await viewLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await viewLink.click();
    }

    // La liste des dossiers doit être visible et contenir notre dossier
    await page.waitForSelector('[data-testid="dossier-list"]', { timeout: 10_000 });
    await expect(page.locator('[data-testid="dossier-list"]')).toContainText(
      'Dossier Test Chiffrement'
    );
  });
});
