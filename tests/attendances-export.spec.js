import { test, expect } from '@playwright/test';
import { ACCOUNTS, loginByRequest } from './helpers/auth.js';
import {
  createInvitationFixture,
  createCompletedAttendanceFixture,
  cleanupMeetingByTitle,
  getAttendanceStatuses,
} from './helpers/db.js';

const timestamp = Date.now();

const fixtureTitles = {
  completed: `Testing Attendance Completed ${timestamp}`,
  scheduled: `Testing Attendance Scheduled ${timestamp}`,
};

let completedFixture;
let scheduledFixture;

test.describe.serial('Attendance & Export Module', () => {
  test.beforeAll(async () => {
    completedFixture = await createCompletedAttendanceFixture({
      title: fixtureTitles.completed,
      organizerId: 2,
      internalEmployeeId: 1,
      internalStatus: 'confirmed',
      externalStatus: 'invited',
    });

    scheduledFixture = await createInvitationFixture({
      title: fixtureTitles.scheduled,
      organizerId: 2,
      participantEmployeeId: 1,
      participantStatus: 'invited',
      meetingStatus: 'scheduled',
    });
  });

  test.afterAll(async () => {
    await cleanupMeetingByTitle(fixtureTitles.completed);
    await cleanupMeetingByTitle(fixtureTitles.scheduled);
  });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();

    // Login sebagai Ahmad karenaEach(async ({ page }) => {
    await page.context().clearCookies();

    // Login sebagai Ahmad karena fixture meeting dibuat dengan organizer_id = 2
    await loginByRequest(page, ACCOUNTS.HOST_AHMAD);
  });

  test('Penyelenggara dapat membuka detail meeting dan melihat daftar kehadiran peserta', async ({ page }) => {
    await page.goto(`/meetings/${completedFixture.meetingId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: fixtureTitles.completed })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Daftar Kehadiran Peserta/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Peserta Internal$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Peserta Eksternal$/i })).toBeVisible();
    await expect(page.getByText(/^Peserta Eksternal Testing$/i)).toBeVisible();
  });

  test('Tombol export tidak tampil pada meeting yang belum completed', async ({ page }) => {
    await page.goto(`/meetings/${scheduledFixture.meetingId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: fixtureTitles.scheduled })).toBeVisible();
    await expect(page.getByRole('link', { name: /Export Daftar Hadir/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Export Daftar Hadir/i })).toHaveCount(0);
  });

  test('Export daftar hadir belum aktif jika status kehadiran belum final', async ({ page }) => {
    await page.goto(`/meetings/${completedFixture.meetingId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: fixtureTitles.completed })).toBeVisible();

    await expect(page.getByRole('link', { name: /Export Daftar Hadir/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Export Daftar Hadir/i })).toBeVisible();
  });

  test('Penyelenggara dapat mengupdate status kehadiran peserta', async ({ page }) => {
    await page.goto(`/meetings/${completedFixture.meetingId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: fixtureTitles.completed })).toBeVisible();

    await page.getByRole('button', { name: /Edit Kehadiran/i }).click();

    const internalSelect = page.locator('select[name^="internal_status_"]').first();
    const externalSelect = page.locator('select[name^="external_status_"]').first();

    await expect(internalSelect).toBeVisible();
    await expect(externalSelect).toBeVisible();

    await internalSelect.selectOption('attended');
    await externalSelect.selectOption('absent');

    await page.getByRole('button', { name: /Simpan Kehadiran/i }).click();

    await expect(page).toHaveURL(new RegExp(`/meetings/${completedFixture.meetingId}`));

    const statuses = await getAttendanceStatuses(completedFixture.meetingId);

    expect(statuses.internal).toContain('attended');
    expect(statuses.external).toContain('absent');

    await expect(page.getByText(/Hadir/i).first()).toBeVisible();
    await expect(page.getByText(/Tidak Hadir/i).first()).toBeVisible();
  });

  test('Penyelenggara dapat mengekspor daftar hadir setelah status kehadiran final', async ({ page }) => {
    await page.goto(`/meetings/${completedFixture.meetingId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: fixtureTitles.completed })).toBeVisible();

    const exportLink = page.getByRole('link', { name: /Export Daftar Hadir/i });

    await expect(exportLink).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await exportLink.click();

    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/Daftar_Hadir_.*\.xlsx$/);
  });
});
