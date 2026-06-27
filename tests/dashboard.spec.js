import { test, expect } from '@playwright/test';
import { ACCOUNTS, loginByRequest } from './helpers/auth.js';

test.describe('Dashboard Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginByRequest(page, ACCOUNTS.HOST_AHMAD);
  });

  test('Dashboard berhasil tampil setelah login', async ({ page }) => {
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible();
    await expect(page.getByText(/Ringkasan aktivitas dan jadwal meeting Anda/i)).toBeVisible();
  });

  test('Dashboard menampilkan kartu ringkasan data', async ({ page }) => {
    const statCards = page.locator('.fwd-stat-card');

    await expect(statCards.filter({ hasText: 'Meeting Bulan Ini' })).toBeVisible();
    await expect(statCards.filter({ hasText: 'Total Peserta' })).toBeVisible();
    await expect(statCards.filter({ hasText: 'Menunggu Konfirmasi' })).toBeVisible();
    await expect(statCards.filter({ hasText: 'Notulensi' })).toBeVisible();
  });

  test('Dashboard menampilkan section utama', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Meeting Mendatang/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Rapat per Bulan/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Kotak Masuk/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Notulen Terbaru/i })).toBeVisible();
  });

  test('Tombol Semua Rapat mengarah ke halaman daftar meeting', async ({ page }) => {
    await page.getByRole('link', { name: /Semua Rapat/i }).click();

    await expect(page).toHaveURL(/\/meetings/);
    await expect(page.getByRole('heading', { name: /^Daftar Meeting$/i })).toBeVisible();
  });

  test('Shortcut kotak masuk mengarah ke halaman undangan', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    await page.getByRole('link', { name: /Lihat kotak masuk/i }).click();

    await expect(page).toHaveURL(/\/invitations\/inbox/);
  });

  test('Shortcut notulensi mengarah ke halaman upload notulensi', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    await page.getByRole('link', { name: /lihat notulensi/i }).click();

    await expect(page).toHaveURL(/\/meetings\/upload-minutes/);
  });

  test('Meeting mendatang hanya menampilkan status Scheduled atau kondisi kosong', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    const meetingList = page.locator('.fwd-meeting-list');
    const meetingCards = meetingList.locator('.fwd-meeting-card');
    const count = await meetingCards.count();

    if (count === 0) {
      await expect(meetingList.getByText(/Semua Selesai|Tidak ada jadwal meeting mendatang/i)).toBeVisible();
      return;
    }

    for (let i = 0; i < count; i++) {
      await expect(meetingCards.nth(i).locator('.fwd-meeting-status')).toHaveText(/^Scheduled$/i);
    }
  });
});