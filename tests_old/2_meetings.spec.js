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

test.describe('Meetings Module', () => {
  test('Host can create meeting and edit it', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();

    const meetingTitle = `Test_Meeting_Static`;

    // Host Create Meeting
    await login(host, HOST.username, HOST.password);
    await host.getByRole('link', { name: 'Daftar Meeting' }).click();
    await host.getByRole('link', { name: '+ Buat Meeting' }).click();
    await host.getByRole('textbox', { name: 'Judul Meeting *' }).fill(meetingTitle);
    await host.getByRole('textbox', { name: 'Deskripsi / Agenda' }).fill('playwright automation');
    await host.getByRole('textbox', { name: 'Tanggal *' }).fill('2026-06-25');
    await host.getByRole('textbox', { name: 'Lokasi / Link Meeting' }).fill('LAB LSE');
    await host.getByLabel('Peserta Awal').selectOption('1');
    await host.getByRole('button', { name: 'Tambah' }).first().click();
    await host.getByRole('button', { name: 'Buat & Kirim Undangan' }).click();

    // Edit Meeting
    await host.getByRole('link', { name: 'Daftar Meeting' }).click();
    await host.waitForLoadState('networkidle');
    await host.locator('.meeting-card').filter({ hasText: meetingTitle }).click();
    await host.getByRole('link', { name: /Edit Meeting/ }).click();
    await host.getByRole('textbox', { name: 'Tanggal *' }).fill('2026-06-25');
    await host.getByRole('button', { name: 'Simpan' }).click();
  });
});