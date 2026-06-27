import { test, expect } from '@playwright/test';
import { ACCOUNTS, loginByRequest } from './helpers/auth.js';
import {
  createCompletedAttendanceFixture,
  createMinuteFixture,
  cleanupMeetingByTitle,
} from './helpers/db.js';

const timestamp = Date.now();

const fixtureTitles = {
  uploadOption: `Testing Upload Notulensi ${timestamp}`,
  history: `Testing Riwayat Notulensi ${timestamp}`,
};

let uploadFixture;
let historyFixture;

test.describe.serial('Minutes Module', () => {
  test.beforeAll(async () => {
    uploadFixture = await createCompletedAttendanceFixture({
      title: fixtureTitles.uploadOption,
      organizerId: 2,
      internalEmployeeId: 1,
      internalStatus: 'attended',
      externalStatus: 'attended',
    });

    historyFixture = await createMinuteFixture({
      title: fixtureTitles.history,
      organizerId: 2,
      internalEmployeeId: 1,
      summary: `Ringkasan notulensi testing Playwright ${timestamp}`,
    });
  });

  test.afterAll(async () => {
    await cleanupMeetingByTitle(fixtureTitles.uploadOption);
    await cleanupMeetingByTitle(fixtureTitles.history);
  });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();

    // Login sebagai Ahmad karena fixture meeting dibuat dengan organizer_id = 2
    await loginByRequest(page, ACCOUNTS.HOST_AHMAD);
  });

  test('Penyelenggara dapat membuka halaman upload notulensi', async ({ page }) => {
    await page.goto('/meetings/upload-minutes', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/\/meetings\/upload-minutes/);
    await expect(page.getByRole('heading', { name: /^Upload Notulensi dan Dokumentasi$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Form Upload Notulensi$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Riwayat Notulensi/i })).toBeVisible();
  });

  test('Form upload notulensi menampilkan field utama dan meeting completed tanpa notulensi', async ({ page }) => {
    await page.goto('/meetings/upload-minutes', {
      waitUntil: 'domcontentloaded',
    });

    const uploadForm = page.locator('form[method="POST"][action="/meetings/upload-minutes"]');
    const meetingSelect = uploadForm.locator('select[name="meeting_id"]');

    await expect(uploadForm).toBeVisible();
    await expect(meetingSelect).toBeVisible();
    await expect(meetingSelect).toContainText(fixtureTitles.uploadOption);

    // Meeting yang sudah punya notulensi tidak boleh muncul di select upload
    await expect(meetingSelect).not.toContainText(fixtureTitles.history);

    await expect(uploadForm.locator('textarea[name="notes"]')).toBeVisible();
    await expect(uploadForm.locator('input[name="file_notulensi"]')).toBeAttached();
    await expect(uploadForm.locator('input[name="file_dokumentasi"]')).toBeAttached();
    await expect(uploadForm.getByRole('button', { name: /Upload Sekarang/i })).toBeVisible();
  });

  test('Riwayat notulensi menampilkan notulensi yang sudah tersedia dan dapat difilter berdasarkan meeting', async ({ page }) => {
    await page.goto('/meetings/upload-minutes', {
      waitUntil: 'domcontentloaded',
    });

    const filterForm = page.locator('form[method="GET"][action="/meetings/upload-minutes"]');
    const filterSelect = filterForm.locator('select[name="meeting_id"]');

    await expect(filterSelect).toBeVisible();
    await expect(filterSelect).toContainText(fixtureTitles.history);

    await filterSelect.selectOption(String(historyFixture.meetingId));

    await expect(page).toHaveURL(new RegExp(`meeting_id=${historyFixture.meetingId}`));

const historyTable = page.getByRole('table');
const historyRow = historyTable.locator('tr').filter({
  hasText: fixtureTitles.history,
});

await expect(historyRow).toBeVisible();
await expect(historyRow).toContainText(historyFixture.summary);
await expect(historyRow.getByRole('link', { name: /Buka Dokumen/i })).toBeVisible();
  });
});