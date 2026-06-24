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

test.describe('Attendances Module', () => {
  test('Host can export attendance', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();
    const meetingTitle = `Test_Meeting_Static`;

    await login(host, HOST.username, HOST.password);
    await host.getByRole('link', { name: 'Daftar Meeting' }).click();
    await host.waitForLoadState('networkidle');
    await host.locator('.meeting-card').filter({ hasText: meetingTitle }).click();

    // Export - Catch The Download Event (Memerlukan attribut "download" di UI)
    const exportFile = host.waitForEvent('download');
    await host.getByRole('link', { name: /Export Daftar Hadir/ }).click();
    await exportFile;
  });
});