import { test, expect } from '@playwright/test';

const GUEST = { username: '2411521006_lyvia@student.unand.ac.id', password: '12345678' };

async function login(page, username, password) {
  await page.goto('http://localhost:3000/login');
  await page.getByRole('textbox', { name: 'Username' }).fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/home/, { timeout: 15000 });
}

test.setTimeout(60000);

test.describe('Invitations Module', () => {
  test('Guest can accept invitation', async ({ browser }) => {
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    const meetingTitle = `Test_Meeting_Static`;

    await login(guest, GUEST.username, GUEST.password);
    
    // Find invitation by title
    await guest.locator('a[href^="/invitations/"]').filter({ hasText: meetingTitle }).click();
    await guest.getByRole('button', { name: 'Terima Undangan' }).click();
    // Validasi bahwa redirect success diterima (perbaikan race condition db-update)
    await expect(guest).toHaveURL(/success=confirmed/);
  });
});