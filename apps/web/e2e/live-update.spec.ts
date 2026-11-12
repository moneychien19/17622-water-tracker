import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct horse battery';
const run = Date.now().toString(36);
const aliceEmail = `alice-${run}@example.com`;
const bobEmail = `bob-${run}@example.com`;

async function register(page: Page, email: string, displayName: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your plants' })).toBeVisible();
}

const section = (page: Page, name: 'Needs water' | 'OK') =>
  page.getByRole('region', { name: new RegExp(`^${name}`) });

test('SC-004: a watering by one member updates another member’s dashboard live', async ({
  browser,
}) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();
  alice.on('dialog', (d) => void d.accept());

  // Alice: account, shared group, plant, invitation.
  await register(alice, aliceEmail, 'Alice');
  await alice.getByRole('link', { name: 'Groups' }).click();
  await alice.getByLabel('New group name').fill('Balcony');
  await alice.getByRole('button', { name: 'Create group' }).click();
  await alice.getByRole('listitem').filter({ hasText: 'Balcony' }).getByRole('link').click();
  const inviteForm = alice.getByRole('form', { name: 'Invite by email' });
  await inviteForm.getByRole('textbox', { name: 'Email' }).fill(bobEmail);
  await inviteForm.getByRole('button', { name: 'Send invite' }).click();
  await expect(alice.getByText(bobEmail)).toBeVisible();

  await alice.getByRole('link', { name: 'Dashboard' }).click();
  const form = alice.getByRole('form', { name: 'Add a plant' });
  await form.getByLabel('Group').selectOption({ label: 'Balcony' });
  await form.getByLabel('Name').fill('Tomato');
  await form.getByLabel('Water every (days)').fill('2');
  await form.getByLabel('Location').selectOption('outside');
  await form.getByRole('button', { name: 'Add plant' }).click();
  await expect(section(alice, 'Needs water').getByText('Tomato')).toBeVisible();
  await expect(alice.getByText('☀ Outside')).toBeVisible();

  // Bob: registers with the invited email and accepts.
  await register(bob, bobEmail, 'Bob');
  await bob.getByRole('link', { name: /Invitations/ }).click();
  await expect(bob.getByText('Invited by Alice')).toBeVisible();
  await bob.getByRole('button', { name: 'Accept' }).click();
  await expect(section(bob, 'Needs water').getByText('Tomato')).toBeVisible();

  // Caretaker sees no owner-only controls (quickstart Scenario 2, step 3).
  await bob.getByRole('link', { name: 'Tomato' }).click();
  await expect(bob.getByRole('heading', { name: /Tomato/ })).toBeVisible();
  await expect(bob.getByRole('button', { name: 'Delete plant' })).toHaveCount(0);
  await bob.getByRole('button', { name: 'Edit' }).click();
  await expect(bob.getByRole('form', { name: 'Edit plant' }).getByLabel('Name')).toHaveCount(0);
  await bob.getByRole('button', { name: 'Cancel' }).click();
  await bob.getByRole('link', { name: 'Dashboard' }).click();
  await expect(section(bob, 'Needs water').getByText('Tomato')).toBeVisible();

  // Alice waters; Bob's open dashboard updates without reload.
  let bobReloaded = false;
  bob.on('framenavigated', () => {
    bobReloaded = true;
  });
  await alice.getByRole('button', { name: 'Mark Tomato watered' }).click();
  await expect(section(bob, 'OK').getByText('Tomato')).toBeVisible({ timeout: 5_000 });
  await expect(bob.getByText(/Last watered .* by Alice/)).toBeVisible();
  expect(bobReloaded).toBe(false);

  // Bob moves the plant inside; Alice sees it live.
  await bob.getByRole('button', { name: 'Move Tomato inside' }).click();
  await expect(alice.getByText('☀ Outside')).toBeHidden({ timeout: 5_000 });

  // Alice removes Bob; Tomato disappears from Bob's page.
  await alice.getByRole('link', { name: 'Groups' }).click();
  await alice.getByRole('listitem').filter({ hasText: 'Balcony' }).getByRole('link').click();
  await alice
    .getByRole('listitem')
    .filter({ hasText: 'Bob' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(bob.getByText('Tomato')).toBeHidden({ timeout: 5_000 });

  await aliceCtx.close();
  await bobCtx.close();
});

test('signed-out visitors are redirected to sign in; bad credentials show a generic error', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
});

test('quickstart Scenario 1: grouping, ordering, Outside filter, water and undo', async ({
  page,
}) => {
  await register(page, `solo-${run}@example.com`, 'Solo');
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
  const isoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const add = async (name: string, days: string, location: string, lastWatered?: Date) => {
    const form = page.getByRole('form', { name: 'Add a plant' });
    if (!(await form.isVisible())) await page.getByRole('button', { name: '+ Add plant' }).click();
    await form.getByLabel('Name').fill(name);
    await form.getByLabel('Water every (days)').fill(days);
    await form.getByLabel('Location').selectOption(location);
    if (lastWatered) await form.getByLabel('Last watered (optional)').fill(isoDate(lastWatered));
    await form.getByRole('button', { name: 'Add plant' }).click();
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  };
  await add('Fern', '3', 'inside');
  await add('Basil', '1', 'outside', twoDaysAgo);
  await add('Cactus', '14', 'inside', new Date());

  const names = (s: 'Needs water' | 'OK') =>
    section(page, s).getByRole('heading', { level: 3 }).allInnerTexts();
  // Basil (most overdue) before Fern (never watered, due at creation); Cactus is OK.
  expect((await names('Needs water')).map((n) => n.split(' ')[0])).toEqual(['Basil', 'Fern']);
  expect((await names('OK')).map((n) => n.split(' ')[0])).toEqual(['Cactus']);

  await page.getByLabel(/Outside only/).check();
  expect((await names('Needs water')).map((n) => n.split(' ')[0])).toEqual(['Basil']);
  expect(await names('OK')).toEqual([]);
  await page.getByLabel(/Outside only/).uncheck();

  await page.getByRole('button', { name: 'Mark Basil watered' }).click();
  await expect(section(page, 'OK').getByText('Basil')).toBeVisible();
  await expect(section(page, 'OK').getByText('Due tomorrow')).toBeVisible();

  await page.getByRole('button', { name: 'Undo watering Basil' }).click();
  await expect(section(page, 'Needs water').getByText('Basil')).toBeVisible();

  await page.getByRole('link', { name: 'Basil', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Watering history' }).getByText('by Solo'),
  ).toHaveCount(1);
});
