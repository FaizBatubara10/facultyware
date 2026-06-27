import { test, expect } from '@playwright/test';

const HOST = { username: '2411521016_ahmad@student.unand.ac.id', password: '12345678' };

async function login(page, username, password) {
  await page.goto('http://localhost:3000/login');
  await page.getByRole('textbox', { name: 'Username' }).fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/home/, { timeout: 15000 });
}

test.setTimeout(60000);

test.describe('Minutes Module', () => {
  test('Host can upload minutes', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();

    await login(host, HOST.username, HOST.password);
    
    // Upload Minutes Flow
    await host.goto('http://localhost:3000/meetings/upload-minutes');
    await host.getByRole('textbox', { name: 'Tuliskan ringkasan atau' }).fill('hasil rapat tersimpan.');
    
    // Skenario Logout
    await host.getByRole('link', { name: 'Keluar Akun' }).click();
  });
});