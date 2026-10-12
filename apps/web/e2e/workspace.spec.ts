import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

async function demo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Incident overview' })).toBeVisible();
}

test('investigate, inspect evidence, review, export, and resolve', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await demo(page);
  await mkdir('../../docs/images', { recursive: true });
  await page.screenshot({ path: '../../docs/images/overview.png', fullPage: true });
  await page.getByRole('button', { name: /RLY-1042/ }).click();
  await page.getByRole('button', { name: 'Run investigation', exact: true }).click();
  await expect(page.getByText('OFFLINE · EXTRACTIVE BRIEF')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Proposed next steps/ })).toBeVisible();
  await page.screenshot({ path: '../../docs/images/investigation.png', fullPage: true });
  await page.getByRole('button', { name: 'View evidence E1' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByText('Immutable snapshot from this analysis.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Approve proposal' }).first().click();
  await page.getByLabel('Decision rationale').fill('Validated against current database telemetry.');
  await page.getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('approved by Demo engineer')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export brief' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('relay-1042.md');
  await page.getByLabel('Change incident status').selectOption('monitoring');
  await expect(page.locator('.incident-title-meta .badge')).toHaveText('monitoring');
  await page.getByLabel('Change incident status').selectOption('resolved');
  await expect(page.locator('.incident-title-meta .badge')).toHaveText('resolved');
  await page.getByRole('button', { name: /Timeline/ }).click();
  await expect(page.getByText('Status changed to resolved')).toBeVisible();
  expect(errors).toEqual([]);
});

test('ingest a document, reject duplicates, and delete with confirmation', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: 'Knowledge base', exact: true }).click();
  await page.getByRole('button', { name: 'Add document', exact: true }).click();
  await page.getByLabel('Document title').fill('Custom queue runbook');
  await page.getByLabel('Service', { exact: true }).fill('custom-worker');
  const text =
    'Inspect the custom queue backlog and retry interval. Confirm the checkpoint before replaying events.';
  await page.getByLabel('Content', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Index document' }).click();
  await expect(page.getByRole('heading', { name: 'Custom queue runbook' })).toBeVisible();
  await page.getByRole('button', { name: 'Add document', exact: true }).click();
  await page.getByLabel('Document title').fill('Duplicate queue runbook');
  await page.getByLabel('Service', { exact: true }).fill('custom-worker');
  await page.getByLabel('Content', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Index document' }).click();
  await expect(page.getByRole('alert')).toContainText('already been indexed');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /Custom queue runbook/ }).click();
  await page.getByRole('button', { name: 'Delete document', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Custom queue runbook' })).toHaveCount(0);
});

test('new incident abstains without matching sources and search works', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: 'New incident', exact: true }).click();
  await page.getByLabel('Incident title').fill('Lunar oxygen scrubber fault');
  await page.getByLabel('Affected service').fill('moon-base');
  await page
    .getByLabel('What are you observing?')
    .fill('Titanium calibration and oxygen scrubber alignment failed in the lunar habitat.');
  await page.getByRole('button', { name: 'Create incident' }).click();
  await expect(page.getByRole('heading', { name: 'Lunar oxygen scrubber fault' })).toBeVisible();
  await page.getByRole('button', { name: 'Run investigation', exact: true }).click();
  await expect(page.getByText('Insufficient matching evidence', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'All incidents', exact: true }).click();
  await page.getByLabel('Search workspace').fill('lunar');
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await expect(page.getByLabel('Search workspace')).toHaveValue('lunar');
  await expect(page.locator('.incident-row')).toHaveCount(1);
  await page.getByLabel('Search workspace').fill('nothing-matches');
  await expect(page.getByRole('heading', { name: 'No matching incidents' })).toBeVisible();
});

test('global search preserves text across routes and browser back resets it', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: /Quality lab/ }).click();
  await expect(page).toHaveURL(/#evaluations$/);
  await page.getByLabel('Search workspace').fill('checkout');
  await expect(page).toHaveURL(/#incidents$/);
  await expect(page.getByLabel('Search workspace')).toHaveValue('checkout');
  await expect(page.locator('.incident-row')).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(/#evaluations$/);
  await expect(page.getByLabel('Search workspace')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Run evaluation', exact: true })).toBeVisible();
});

test('quality lab persists a repeatable baseline', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: /Quality lab/ }).click();
  await page.getByRole('button', { name: 'Run evaluation', exact: true }).click();
  await expect(page.getByText('8 / 8 cases passed')).toBeVisible();
  await expect(page.locator('.eval-case')).toHaveCount(8);
  await page.reload();
  await expect(page.getByText('8 / 8 cases passed')).toBeVisible();
  await page.screenshot({ path: '../../docs/images/quality-lab.png', fullPage: true });
});

test('register a clean workspace, sign out, and sign back in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a workspace', exact: true }).click();
  await page.getByLabel('Your name').fill('Alex Morgan');
  await page.getByLabel('Workspace', { exact: true }).fill('Platform Team');
  await page.getByLabel('Email address').fill('browser-test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('example-password-for-testing');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A clear queue' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Email address').fill('browser-test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('example-password-for-testing');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Incident overview' })).toBeVisible();
});

test('mobile layout stays within viewport and navigation works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '../../docs/images/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Knowledge base', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Knowledge base', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('entry and dashboard meet automated accessibility checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to Relay' })).toBeVisible();
  const entry = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(entry.violations).toEqual([]);
  await page.getByRole('button', { name: 'Explore the demo workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Incident overview' })).toBeVisible();
  const dashboard = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(dashboard.violations).toEqual([]);
});
