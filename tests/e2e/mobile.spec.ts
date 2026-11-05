import { test, expect } from '@playwright/test';
import { startApp, login, nav, noHorizontalScroll } from './helpers';

test('phone layout: drawer navigation, agenda roster, report cards, no horizontal scroll', async ({ page }) => {
  await startApp(page);
  await noHorizontalScroll(page);
  await login(page, 'Admin', '12345a');
  await noHorizontalScroll(page);

  await nav(page, 'Duty Roster');
  await expect(page.getByRole('list', { name: 'Month agenda' })).toBeVisible();
  await noHorizontalScroll(page);

  await nav(page, 'Shift Reports');
  await page.getByRole('button', { name: /Open current shift/ }).click();
  await page.getByRole('button', { name: 'Log event' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  for (const label of ['Executive Review', 'Report Center', 'Audit Trail', 'Dashboard']) {
    await nav(page, label);
    await noHorizontalScroll(page);
  }
});
