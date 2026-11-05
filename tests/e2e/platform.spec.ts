import { test, expect, Page } from '@playwright/test';
import { startApp, login, logout, nav, toast, STRONG } from './helpers';

/**
 * End-to-end SOC workflow (local mode, desktop). Steps share one browser page
 * so state (users, rosters, reports, audit trail) carries through the scenario.
 */
test.describe.configure({ mode: 'serial' });

let page: Page;
const TODAY = '2026-11-05';
const TOMORROW = '2026-11-06';
/** Visible match only (desktop tables and mobile cards coexist in the DOM). */
const seen = (t: string | RegExp) => page.getByText(t).filter({ visible: true }).first();

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'UTC', locale: 'en-US' });
  await startApp(page);
});
test.afterAll(() => page.close());

test('administrator bootstrap enforces MFA enrolment and password rotation', async () => {
  await login(page, 'Admin', '12345a');
  await expect(seen('Morning Shift')).toBeVisible();
});

test('rejects wrong credentials and records the failure', async () => {
  await logout(page);
  await page.locator('#login-user').fill('Admin');
  await page.locator('#login-pass').fill('wrong-password');
  await page.locator('form button[type=submit]').click();
  await expect(page.getByRole('alert')).toContainText('Invalid security credentials');
  await login(page, 'Admin', STRONG.Admin); // MFA challenge path
});

test('provisions analysts with the temporary credential', async () => {
  await page.locator('header').getByRole('button').last().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'All Members' }).click();
  for (const name of ['alice', 'bob']) {
    await page.getByRole('button', { name: 'Add New Analyst' }).click();
    await page.getByPlaceholder('analyst_name').fill(name);
    await page.getByPlaceholder('email@company.com').fill(`${name}@soc.test`);
    await seen('12345a').waitFor();
    await page.getByRole('button', { name: 'Save Analyst' }).click();
    await expect(page.getByText(`${name}@soc.test`)).toBeVisible();
  }
});

test('builds the duty roster', async () => {
  await nav(page, 'Duty Roster');
  await page.getByRole('button', { name: `Roster for ${TODAY}` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Select engineer for Morning Shift').selectOption({ label: 'Admin (Admin)' });
  await dialog.getByRole('button', { name: 'Assign' }).nth(1).click();
  await expect(dialog.getByText('Admin', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: `Roster for ${TOMORROW}` }).click();
  await dialog.getByLabel('Select engineer for Morning Shift').selectOption({ label: 'alice (L1)' });
  await dialog.getByRole('button', { name: 'Assign' }).nth(1).click();
  await expect(dialog.getByText('alice', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(seen('You are on duty')).toBeVisible();
});

const logEvent = async (name: string, ip: string, severity: string, status?: string) => {
  await page.getByRole('button', { name: 'Log event' }).first().click();
  const form = page.getByRole('dialog');
  await form.getByPlaceholder('e.g. SSH brute-force against bastion').fill(name);
  await form.getByPlaceholder('203.0.113.45').fill(ip);
  await form.getByPlaceholder('10.0.1.10').fill('10.0.1.10');
  await form.getByPlaceholder('22').fill('22');
  await form.getByPlaceholder('Brute Force').fill('Brute Force');
  await form.getByText(severity, { exact: true }).click();
  if (status) await form.getByRole('radio', { name: status }).click();
  await form.getByRole('button', { name: 'Log event' }).click();
  await expect(form).toBeHidden();
  await expect(seen(name)).toBeVisible();
};

test('previous shift: logs an open critical event and finalizes', async () => {
  await nav(page, 'Shift Reports');
  await page.getByRole('button', { name: 'Report for date…' }).click();
  await page.getByRole('dialog').locator('input[type=date]').fill(TODAY);
  await page.getByRole('dialog').getByRole('button', { name: /Night Shift/ }).click();
  await page.getByRole('button', { name: 'Create draft' }).click();
  await logEvent('Ransomware beacon on file server', '198.51.100.23', 'Critical');
  await page.getByPlaceholder('Open investigations, pending actions, watch-list IPs…').fill('Beacon still under investigation');
  await page.getByRole('button', { name: 'Finalize', exact: true }).click();
  await expect(seen('Critical events are still Open (not contained)')).toBeVisible();
  await page.getByRole('button', { name: 'Finalize & seal' }).click();
  await expect(seen(/Immutable operational record/)).toBeVisible();
  await page.getByRole('button', { name: 'Verify integrity' }).click();
  await expect(seen('Integrity verified')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log event' })).toHaveCount(0);
});

test('incoming shift signs off the handover', async () => {
  await page.getByRole('button', { name: 'All reports' }).click();
  await page.getByRole('button', { name: 'Review & acknowledge' }).click();
  const dialog = page.getByRole('dialog', { name: 'Shift handover sign-off' });
  await expect(dialog.getByText('Beacon still under investigation')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Acknowledge handover' })).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Acknowledge handover' }).click();
  await expect(seen(/acknowledged by Admin/)).toBeVisible();
});

test('current shift: open items carry over, escalate to an incident, lifecycle and SLA', async () => {
  await page.getByRole('button', { name: /Open current shift/ }).click();
  await expect(seen('Carried over')).toBeVisible();
  await expect(seen('Ransomware beacon on file server')).toBeVisible();

  await page.getByRole('button', { name: 'Escalate to incident' }).first().click();
  await page.getByRole('button', { name: 'Create incident' }).click();
  await toast(page, /Incident .* created/);
  await expect(seen(/^Incident [0-9a-z-]{8}$/)).toBeVisible();

  await page.getByLabel('Status').first().selectOption('Contained');
  await expect(page.getByLabel('Status').first()).toHaveValue('Contained');

  await logEvent('Port scan from external host', '203.0.113.99', 'Low', 'Resolved');
  await page.getByPlaceholder('Overall posture, notable trends, escalations raised…').fill('Ransomware contained; scans resolved.');
  await page.getByPlaceholder('Open investigations, pending actions, watch-list IPs…').fill('Monitor file server for re-infection');
  await page.getByRole('button', { name: 'Sync draft' }).click();
  await toast(page, 'Draft synchronized');
  await page.getByRole('button', { name: 'Finalize', exact: true }).click();
  await page.getByRole('button', { name: 'Finalize & seal' }).click();
  await expect(seen(/Immutable operational record/)).toBeVisible();
});

test('escalated incident appears in the incident register', async () => {
  await nav(page, 'Incidents');
  await expect(seen('Ransomware beacon on file server')).toBeVisible();
});

test('exports a sealed report as PDF and a batch ZIP', async () => {
  await nav(page, 'Shift Reports');
  await seen(`Morning Shift Report — ${TODAY}`).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /PDF document/ }).click();
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF' }).click()]);
  expect(pdf.suggestedFilename()).toBe(`GEYES_${TODAY}_morning_finalized.pdf`);

  await page.getByRole('button', { name: 'All reports' }).click();
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: 'Export ZIP' }).click();
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: 'Export ZIP' }).click()]);
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
});

test('executive review shows response performance', async () => {
  await nav(page, 'Executive Review');
  await expect(seen('SLA compliance')).toBeVisible();
  await expect(seen('Handover sign-off')).toBeVisible();
  await expect(seen('100%')).toBeVisible(); // handover compliance 1/1
});

test('shift swap: request → colleague accepts → admin approves → roster updated', async () => {
  await logout(page);
  await login(page, 'bob', '12345a');
  await logout(page);
  await login(page, 'alice', '12345a');
  await nav(page, 'Duty Roster');
  await page.getByRole('button', { name: `Roster for ${TOMORROW}` }).click();
  await page.getByRole('button', { name: 'Request swap' }).click();
  const swap = page.getByRole('dialog', { name: 'Request shift swap' });
  await swap.locator('select').first().selectOption({ label: 'bob' });
  await swap.getByPlaceholder('e.g. medical appointment, training, leave…').fill('Training course');
  await swap.getByRole('button', { name: 'Send request' }).click();
  await toast(page, 'Swap request sent');
  await page.keyboard.press('Escape');
  await logout(page);

  await login(page, 'bob', STRONG.bob);
  await nav(page, 'Duty Roster');
  await page.getByRole('button', { name: 'Accept' }).click();
  await toast(page, 'Swap accepted — awaiting approval');
  await logout(page);

  await login(page, 'Admin', STRONG.Admin);
  await nav(page, 'Duty Roster');
  await page.getByRole('button', { name: 'Approve' }).click();
  await toast(page, 'Swap approved — roster updated');
  await page.getByRole('button', { name: `Roster for ${TOMORROW}` }).click();
  const day = page.getByRole('dialog');
  await expect(day.getByText('bob', { exact: true })).toBeVisible();
  await expect(day.getByText('alice', { exact: true })).toHaveCount(0);
  await day.getByRole('button', { name: 'Done' }).click();
});

test('report center: schedule, run, archive with integrity verification', async () => {
  await nav(page, 'Report Center');
  await page.getByRole('button', { name: 'New schedule' }).click();
  await page.getByPlaceholder('e.g. Weekly CISO brief').fill('Weekly CISO brief');
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await toast(page, 'Schedule saved');
  await page.getByRole('button', { name: 'Run now' }).click();
  await toast(page, /Report generated for/);
  await page.getByRole('button', { name: 'View', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Weekly CISO brief' }).first()).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Verify integrity' }).click();
  await expect(seen('Integrity verified')).toBeVisible();
});

test('audit trail is complete and verifiable', async () => {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await nav(page, 'Audit Trail');
  for (const action of ['MFA_ENROLLED', 'FORCED_PASSWORD_CHANGE', 'USER_CREATED', 'SHIFT_REPORT_FINALIZED', 'HANDOVER_ACKNOWLEDGED', 'EVENT_ESCALATED', 'SHIFT_SWAP_APPROVED', 'LOGIN_FAILED']) {
    await expect(page.locator('td span', { hasText: new RegExp(`^${action}$`) }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: 'Verify integrity' }).click();
  await expect(seen(/entries verified · 0 failed verification/)).toBeVisible();
});

test('switches the interface to Simplified Chinese', async () => {
  await page.locator('header').getByRole('button').last().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /简体中文/ }).click();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('navigation').getByRole('button', { name: '值班表' })).toBeVisible();
  await nav(page, '班次报告');
  await expect(page.getByRole('heading', { name: '班次报告', level: 3 })).toBeVisible();
  await expect(page.getByRole('button', { name: /打开当前班次/ })).toBeVisible();
});
