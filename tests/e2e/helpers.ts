import { expect, Page } from '@playwright/test';
import { totp } from '../../lib/totp';

export const FIXED_NOW = new Date('2026-11-05T10:00:00Z'); // morning shift (UTC timezone)
export const STRONG = { Admin: 'Adm1n!Strong#Pass', alice: 'Al1ce!Strong#Pass', bob: 'B0b!Strong#Passwd' } as const;

/** Per-user TOTP secrets captured at enrolment, and the last used time-step (replay protection). */
const secrets: Record<string, string> = {};
const lastStep: Record<string, number> = {};

export const startApp = async (page: Page) => {
  await page.clock.install({ time: FIXED_NOW });
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? (d.defaultValue() || 'Rejected for test') : undefined));
  await page.goto('/');
};

/** A TOTP code valid for the page's (fake) clock and not used before. */
const codeFor = async (page: Page, user: string) => {
  let now = await page.evaluate(() => Date.now());
  let step = Math.floor(now / 30_000);
  if (lastStep[user] !== undefined && step <= lastStep[user]) {
    await page.clock.runFor((lastStep[user] - step + 1) * 30_000);
    now = await page.evaluate(() => Date.now());
    step = Math.floor(now / 30_000);
  }
  lastStep[user] = step;
  return totp(secrets[user], now);
};

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;

/**
 * Full sign-in: password → (MFA enrol | MFA challenge) → (forced password change).
 * `password` is the current credential; first logins rotate to STRONG[user].
 */
export const login = async (page: Page, user: keyof typeof STRONG, password: string) => {
  await page.locator('#login-user').fill(user);
  await page.locator('#login-pass').fill(password);
  await page.getByRole('button', { name: /Establish|Connect|connect/i }).or(page.locator('form button[type=submit]')).first().click();

  const enrol = page.getByTestId('mfa-secret');
  const challenge = page.getByText('Enter the 6-digit code from your authenticator app.');
  const forced = page.getByText('Password change required');
  const home = page.getByText('Duty Now').first();
  await expect(enrol.or(challenge).or(forced).or(home)).toBeVisible();

  if (await enrol.isVisible()) {
    secrets[user] = (await enrol.textContent())!.replace(/\s/g, '');
    await page.getByPlaceholder('000000').fill(await codeFor(page, user));
    await page.getByRole('button', { name: 'Activate & continue' }).click();
  } else if (await challenge.isVisible()) {
    await page.getByPlaceholder('000000').fill(await codeFor(page, user));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
  }

  await expect(forced.or(home)).toBeVisible();
  if (await forced.isVisible()) {
    const pw = page.locator('input[type=password]');
    await pw.nth(0).fill(password);
    await pw.nth(1).fill(STRONG[user]);
    await pw.nth(2).fill(STRONG[user]);
    await page.getByRole('button', { name: 'Update password' }).click();
  }
  await expect(home).toBeVisible();
};

export const logout = async (page: Page) => {
  await page.locator('header').getByRole('button').last().click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.locator('#login-user')).toBeVisible();
};

/** Navigate via the sidebar (desktop) or the slide-in drawer (mobile). */
export const nav = async (page: Page, label: string) => {
  if (isMobile(page)) await page.getByRole('button', { name: 'Open menu' }).click();
  const btn = page.getByRole('navigation').getByRole('button', { name: label, exact: true });
  if (process.env.E2E_DEBUG && (await btn.count()) !== 1) {
    console.log('NAV', label, await page.getByRole('navigation').getByRole('button').evaluateAll(els => els.map(e => e.getAttribute('aria-label'))));
  }
  await btn.click();
};

export const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).filter({ visible: true }).first()).toBeVisible();

export const noHorizontalScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1);
};
