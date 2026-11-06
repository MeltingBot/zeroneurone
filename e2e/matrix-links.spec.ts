import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { setupCleanEnvironment } from './fixtures/test-utils';

const CSV = [
  'type,label,de,vers,date_debut,montant,ville',
  'element,Jean Martin,,,,,Paris',
  'element,Paul Durand,,,,,Lyon',
  'lien,virement,Jean Martin,Paul Durand,2024-02-10 09:15,120,',
  'lien,virement,Paul Durand,Jean Martin,2024-03-01,35,',
].join('\n');

test('the matrix lists the links with their ends and properties, and exports both tables', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'virements.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8'),
  });
  await expect(page.locator('.react-flow__edge-custom')).toHaveCount(2, { timeout: 15000 });

  await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
  await page.keyboard.press('4');
  const elementsTable = page.getByTestId('matrix-elements');
  await expect(elementsTable.getByRole('row')).toHaveCount(3); // header + 2 elements

  await elementsTable.getByTestId('matrix-kind-links').click();
  const linksTable = page.getByTestId('matrix-links');
  await expect(linksTable).toBeVisible();
  await expect(elementsTable).toBeHidden();
  const header = linksTable.getByRole('row').first();
  for (const name of ['Label', 'From', 'To', 'Start date', 'montant']) {
    await expect(header.getByRole('columnheader', { name })).toBeVisible();
  }
  // Sorted by amount: 35 first
  await header.getByRole('columnheader', { name: 'montant' }).getByRole('button').click();
  const firstRow = linksTable.getByRole('row').nth(1);
  await expect(firstRow.getByRole('gridcell').nth(1)).toHaveText('Paul Durand');
  await expect(firstRow).toContainText('35');

  // Workbook: both tables, one sheet each
  for (const format of ['xlsx', 'ods'] as const) {
    await linksTable.getByTestId('matrix-export').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId(`matrix-export-${format}`).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`_matrice_\\d+\\.${format}$`));
    const zip = await JSZip.loadAsync(readFileSync((await download.path())!));
    if (format === 'xlsx') {
      const workbook = await zip.file('xl/workbook.xml')!.async('string');
      expect([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])).toEqual(['Elements', 'Links']);
      const links = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
      expect(links).toContain('<v>120</v>'); // the amount as a number
    } else {
      const content = await zip.file('content.xml')!.async('string');
      expect([...content.matchAll(/<table:table table:name="([^"]+)"/g)].map((m) => m[1])).toEqual(['Elements', 'Links']);
      expect(content).toContain('office:date-value="2024-02-10T09:15:00"');
    }
  }
});
