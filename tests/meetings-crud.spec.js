import { test, expect } from '@playwright/test';
import { ACCOUNTS, loginByRequest } from './helpers/auth.js';

const timestamp = Date.now();

const testData = {
  title: `Testing Meeting Playwright ${timestamp}`,
  editedTitle: `Testing Meeting Playwright Edited ${timestamp}`,
  description: 'Meeting ini dibuat otomatis menggunakan Playwright untuk pengujian fitur create meeting.',
  editedDescription: 'Meeting ini sudah diperbarui otomatis menggunakan Playwright.',
  date: getFutureDate(14),
  editedDate: getFutureDate(21),
};

function getFutureDate(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function goToMeetingsPage(page) {
  await page.goto('/meetings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^Daftar Meeting$/i })).toBeVisible();
}

async function searchMeeting(page, title) {
  await goToMeetingsPage(page);

  await page.locator('input[name="q"]').fill(title);
  await page.getByRole('button', { name: /^Cari$/i }).click();

  await expect(page).toHaveURL(/q=/);
}

async function openMeetingDetailByTitle(page, title) {
  await searchMeeting(page, title);

  const meetingCard = page.locator('.meeting-card').filter({ hasText: title }).first();

  await expect(meetingCard).toBeVisible();
  await meetingCard.click();

  await expect(page).toHaveURL(/\/meetings\/\d+/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test.describe.serial('Meetings CRUD Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginByRequest(page, ACCOUNTS.HOST_AHMAD);
  });

  test('Penyelenggara dapat membuka form tambah meeting', async ({ page }) => {
    await goToMeetingsPage(page);

    await page.getByRole('link', { name: /Buat Meeting/i }).click();

    await expect(page).toHaveURL(/\/meetings\/create/);
    await expect(page.getByRole('heading', { name: /Buat Meeting Baru/i })).toBeVisible();
    await expect(page.locator('#title')).toBeVisible();
    await expect(page.locator('#meeting_date')).toBeVisible();
    await expect(page.locator('#meeting_type')).toBeVisible();
  });

  test('Form tambah meeting tidak dapat disimpan jika judul kosong', async ({ page }) => {
    await page.goto('/meetings/create', { waitUntil: 'domcontentloaded' });

    await page.locator('#meeting_date').fill(testData.date);
    await page.locator('#meeting_type').selectOption('offline');
    await page.locator('#online_link').fill('Ruang Rapat Testing');

    await page.getByRole('button', { name: /Buat & Kirim Undangan/i }).click();

    await expect(page).toHaveURL(/\/meetings\/create/);

    const isInvalid = await page.locator('#title').evaluate((el) => !el.checkValidity());
    expect(isInvalid).toBeTruthy();
  });

  test('Penyelenggara berhasil membuat meeting scheduled', async ({ page }) => {
    await page.goto('/meetings/create', { waitUntil: 'domcontentloaded' });

    await page.locator('#title').fill(testData.title);
    await page.locator('#description').fill(testData.description);
    await page.locator('#meeting_date').fill(testData.date);
    await page.locator('#meeting_type').selectOption('offline');
    await page.locator('#online_link').fill('Ruang Rapat Testing Playwright');

    await page.getByRole('button', { name: /Buat & Kirim Undangan/i }).click();

    await expect(page).toHaveURL(/\/meetings/);

    await searchMeeting(page, testData.title);

    const createdMeeting = page.locator('.meeting-card').filter({ hasText: testData.title }).first();

    await expect(createdMeeting).toBeVisible();
    await expect(createdMeeting).toContainText(/Scheduled/i);
  });

  test('Penyelenggara berhasil mengedit meeting yang dibuat saat testing', async ({ page }) => {
    await openMeetingDetailByTitle(page, testData.title);

    await page.getByRole('link', { name: /Edit Meeting/i }).click();

    await expect(page).toHaveURL(/\/meetings\/\d+\/edit/);
    await expect(page.getByRole('heading', { name: /Edit Meeting/i })).toBeVisible();

    await page.locator('#title').fill(testData.editedTitle);
    await page.locator('#description').fill(testData.editedDescription);
    await page.locator('#meeting_date').fill(testData.editedDate);
    await page.locator('#meeting_type').selectOption('online');
    await page.locator('#online_link').fill('https://meet.google.com/testing-playwright');

    await page.getByRole('button', { name: /^Simpan$/i }).click();

    await expect(page).toHaveURL(/\/meetings\/\d+/);
    await expect(page.getByRole('heading', { name: testData.editedTitle })).toBeVisible();
    await expect(page.getByText(testData.editedDescription)).toBeVisible();
    await expect(page.locator('.detail-type-pill')).toContainText(/Online/i);
  });

  test('Penyelenggara berhasil menghapus meeting yang dibuat saat testing', async ({ page }) => {
    await openMeetingDetailByTitle(page, testData.editedTitle);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Yakin ingin menghapus meeting ini?');
      await dialog.accept();
    });

    await page.getByRole('button', { name: /Hapus/i }).click();

    await expect(page).toHaveURL(/\/meetings/);

    await searchMeeting(page, testData.editedTitle);

    await expect(page.locator('.meeting-card').filter({ hasText: testData.editedTitle })).toHaveCount(0);
  });
});