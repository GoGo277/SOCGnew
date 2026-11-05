import { test, expect, Page } from '@playwright/test';
import { startApp, login } from './helpers';
import { startMockIris, MockIris } from '../iris/mockIris';

/**
 * IRIS-style investigation workflow + two-way DFIR-IRIS sync against a mock
 * IRIS v2.4 API (local mode: the browser calls the mock directly via CORS).
 */
test.describe.configure({ mode: 'serial' });

let page: Page;
let iris: MockIris;
const seen = (t: string | RegExp) => page.getByText(t).filter({ visible: true }).first();
const nav = (label: string) => page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();

test.beforeAll(async ({ browser }) => {
  iris = await startMockIris('e2e-key');
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'UTC', locale: 'en-US', colorScheme: 'light' });
  await startApp(page);
  await login(page, 'Admin', '12345a');
});
test.afterAll(async () => { await page.close(); await iris.close(); });

test('case templates: starter playbooks', async () => {
  await nav('Case templates');
  await page.getByRole('button', { name: 'Add starter playbooks' }).click();
  await expect(seen('Phishing investigation')).toBeVisible();
});

test('alert triage: create, assign, escalate into a templated case', async () => {
  await nav('Alerts');
  await page.getByRole('button', { name: 'New alert' }).click();
  const d = page.getByRole('dialog');
  await d.locator('input').first().fill('Credential phishing reported by finance');
  await d.getByRole('button', { name: 'Add IOC' }).click();
  await d.getByLabel('IOC value').fill('login-micros0ft.example');
  await d.getByLabel('IOC type').selectOption('domain');
  await d.getByRole('button', { name: 'Create alert' }).click();
  await page.getByRole('button', { name: 'Select alert #1' }).click();
  await page.getByRole('button', { name: 'Assign to me' }).click();
  await page.getByRole('button', { name: 'Select alert #1' }).click();
  await page.getByRole('button', { name: 'Escalate to case' }).click();
  await page.getByRole('dialog').locator('select').selectOption({ label: 'Phishing investigation' });
  await page.getByRole('dialog').getByRole('button', { name: 'Open case' }).click();
  await expect(page.getByText('Case #1')).toBeVisible();
  await page.getByRole('tab', { name: /Tasks/ }).click();
  await expect(seen('Collect the original email (EML) and headers')).toBeVisible();
  await page.getByRole('tab', { name: /IOCs/ }).click();
  await expect(seen('login-micros0ft.example')).toBeVisible();
});

test('case work: timeline, evidence with custody, task status, note', async () => {
  await page.getByRole('tab', { name: /Timeline/ }).click();
  await page.getByRole('button', { name: 'Add event' }).click();
  const d = page.getByRole('dialog');
  await d.locator('input').first().fill('User submitted credentials');
  await d.locator('select').first().selectOption('Initial Access');
  await d.getByRole('checkbox', { name: 'Show in case summary' }).check();
  await d.getByRole('button', { name: 'Add event' }).click();
  await expect(seen('User submitted credentials')).toBeVisible();

  await page.getByRole('tab', { name: /Evidence/ }).click();
  await page.getByRole('button', { name: 'Register evidence' }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'phish.eml', mimeType: 'message/rfc822', buffer: Buffer.from('From: attacker@example\n\nhello') });
  await expect(page.getByRole('dialog').locator('input[value="phish.eml"]')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Register' }).click();
  await expect(seen(/SHA-256 [0-9a-f]{64}/)).toBeVisible();
  await page.getByRole('button', { name: 'Custody entry' }).click();
  await page.getByRole('alertdialog').locator('input').fill('Copied to forensic workstation');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(seen(/Copied to forensic workstation/)).toBeVisible();

  await page.getByRole('tab', { name: /Tasks/ }).click();
  const task = () => page.locator('li', { hasText: 'Collect the original email (EML) and headers' });
  await task().getByLabel('Task status').selectOption('Done');
  await expect(task().getByLabel('Task status')).toHaveValue('Done');

  await page.getByRole('tab', { name: /Summary/ }).click();
  await expect(seen('User submitted credentials')).toBeVisible();
});

test('IRIS: connect, push the case, pull changes made in IRIS', async () => {
  await nav('Integrations');
  await page.getByPlaceholder('https://iris.example.com').fill(iris.url);
  await page.locator('input[type=password]').fill(iris.apiKey);
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(seen('Connected to IRIS v2.4.20')).toBeVisible();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(seen(/Pushed 1 case\(s\), 1 alert\(s\)/)).toBeVisible();

  expect(iris.state.cases).toHaveLength(1);
  const rc = iris.state.cases[0];
  expect(rc.case_soc_id).toBe('GEYES-1');
  expect(iris.state.objects.ioc.map(i => i.ioc_value)).toContain('login-micros0ft.example');
  expect(iris.state.objects.timeline.map(e => e.event_title)).toContain('User submitted credentials');
  expect(iris.state.objects.evidences).toHaveLength(1);

  // An analyst works the case in IRIS: moves it to Containment and adds an IOC.
  rc.state_id = 3;
  iris.state.objects.ioc.push({ ioc_id: 9901, case_id: rc.case_id, ioc_value: '203.0.113.200', ioc_type_id: 1, ioc_tlp_id: 2, ioc_description: 'Phishing kit host', ioc_tags: '' });
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(seen(/1 new object\(s\), 1 update\(s\)/)).toBeVisible();

  await nav('Cases');
  await page.getByRole('button', { name: 'Credential phishing reported by finance' }).click();
  await expect(seen('Containment')).toBeVisible();
  await expect(seen(/Linked to IRIS case #\d+/)).toBeVisible();
  await page.getByRole('tab', { name: /IOCs/ }).click();
  await expect(seen('203.0.113.200')).toBeVisible();
  await page.getByRole('tab', { name: /Activity/ }).click();
  await expect(seen('Updated from IRIS')).toBeVisible();
});

test('case report and closure', async () => {
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: 'Generate' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^GEYES_case_1_.*\.pdf$/);
  await page.getByRole('button', { name: 'Close case' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close case' }).click();
  await expect(seen('Closed cases are read-only. Reopen the case to change it.')).toBeVisible();
});

test('global search finds the case by IOC', async () => {
  await page.getByRole('combobox', { name: 'Search cases, alerts and IOCs' }).fill('micros0ft');
  await page.getByRole('option').filter({ hasText: 'domain · Case #1' }).click();
  await expect(page.getByRole('heading', { name: 'Credential phishing reported by finance' })).toBeVisible();
});
