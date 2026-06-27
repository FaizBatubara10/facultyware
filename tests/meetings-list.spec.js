import { test, expect } from '@playwright/test';
import { ACCOUNTS, loginByRequest } from './helpers/auth.js';

test.describe('Meetings List Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginByRequest(page, ACCOUNTS.HOST_AHMAD);
    await page.goto('/meetings', { waitUntil: 'domcontentloaded' });
  });

  test('Penyelenggara dapat membuka halaman daftar meeting', async ({ page }) => {
    await expect(page).toHaveURL(/\/meetings/);
    await expect(page.getByRole('heading', { name: /^Daftar Meeting$/i })).toBeVisible();
    await expect(page.getByText(/Kelola jadwal dan data meeting Anda/i)).toBeVisible();
  });

  test('Tombol buat meeting tampil untuk penyelenggara', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Buat Meeting/i })).toBeVisible();
  });

  test('Daftar meeting menampilkan minimal satu data atau empty state', async ({ page }) => {
    const meetingCards = page.locator('.meeting-card');
    const count = await meetingCards.count();

    if (count > 0) {
      await expect(meetingCards.first()).toBeVisible();
      await expect(meetingCards.first().locator('.meeting-card-title')).toBeVisible();
      return;
    }

    await expect(page.getByText(/Meeting Tidak Ditemukan/i)).toBeVisible();
  });

  test('Search meeting berdasarkan keyword berhasil dijalankan', async ({ page }) => {
    await page.locator('input[name="q"]').fill('Rapat');
    await page.getByRole('button', { name: /^Cari$/i }).click();

    await expect(page).toHaveURL(/q=Rapat/);
    await expect(page.getByRole('heading', { name: /^Daftar Meeting$/i })).toBeVisible();
  });

  test('Filter status scheduled berhasil dijalankan', async ({ page }) => {
    await page.locator('select[name="status"]').selectOption('scheduled');

    await expect(page).toHaveURL(/status=scheduled/);
    await expect(page.getByRole('heading', { name: /^Daftar Meeting$/i })).toBeVisible();
  });

  test('Sort meeting terlama berhasil dijalankan', async ({ page }) => {
    await page.locator('select[name="sort"]').selectOption('oldest');

    await expect(page).toHaveURL(/sort=oldest/);
    await expect(page.getByRole('heading', { name: /^Daftar Meeting$/i })).toBeVisible();
  });

  test('Klik salah satu meeting membuka halaman detail meeting', async ({ page }) => {
    const firstMeeting = page.locator('.meeting-card').first();

    await expect(firstMeeting).toBeVisible();

    const title = await firstMeeting.locator('.meeting-card-title').innerText();

    await firstMeeting.click();

    await expect(page).toHaveURL(/\/meetings\/\d+/);
    await expect(page.getByText(title)).toBeVisible();
  });
});