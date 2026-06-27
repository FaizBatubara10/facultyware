import { test, expect } from '@playwright/test';
import { ACCOUNTS, loginByRequest } from './helpers/auth.js';
import {
  createInvitationFixture,
  cleanupMeetingByTitle,
} from './helpers/db.js';

const timestamp = Date.now();

const fixtureTitles = {
  inbox: `Testing Undangan Inbox ${timestamp}`,
  accept: `Testing Undangan Terima ${timestamp}`,
  decline: `Testing Undangan Tolak ${timestamp}`,
};

let inboxFixture;
let acceptFixture;
let declineFixture;

test.describe.serial('Invitations Module', () => {
  test.beforeAll(async () => {
    inboxFixture = await createInvitationFixture({
      title: fixtureTitles.inbox,
      organizerId: 2,
      participantEmployeeId: 1,
      participantStatus: 'invited',
      meetingStatus: 'scheduled',
    });

    acceptFixture = await createInvitationFixture({
      title: fixtureTitles.accept,
      organizerId: 2,
      participantEmployeeId: 1,
      participantStatus: 'invited',
      meetingStatus: 'scheduled',
    });

    declineFixture = await createInvitationFixture({
      title: fixtureTitles.decline,
      organizerId: 2,
      participantEmployeeId: 1,
      participantStatus: 'invited',
      meetingStatus: 'scheduled',
    });
  });

  test.afterAll(async () => {
    await cleanupMeetingByTitle(fixtureTitles.inbox);
    await cleanupMeetingByTitle(fixtureTitles.accept);
    await cleanupMeetingByTitle(fixtureTitles.decline);
  });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();

    // Login sebagai Lyvia karena undangan dibuat untuk employee_id = 1
    await loginByRequest(page, ACCOUNTS.HOST_LYVIA);
  });

  test('Peserta dapat membuka halaman kotak masuk undangan', async ({ page }) => {
    await page.goto('/invitations/inbox', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/invitations\/inbox/);
    await expect(page.getByRole('heading', { name: /^Kotak Masuk$/i })).toBeVisible();
    await expect(page.getByText(/Undangan rapat yang menunggu konfirmasi Anda/i)).toBeVisible();
  });

  test('Kotak masuk menampilkan undangan yang menunggu konfirmasi', async ({ page }) => {
    await page.goto('/invitations/inbox', { waitUntil: 'domcontentloaded' });

    const invitationCard = page.locator('.fwd-inv-card').filter({
      hasText: fixtureTitles.inbox,
    });

    await expect(invitationCard).toBeVisible();
    await expect(invitationCard.locator('.fwd-inv-badge')).toContainText(/Menunggu Konfirmasi/i);
  });

  test('Peserta dapat membuka detail undangan meeting', async ({ page }) => {
    await page.goto('/invitations/inbox', { waitUntil: 'domcontentloaded' });

    const invitationCard = page.locator('.fwd-inv-card').filter({
      hasText: fixtureTitles.inbox,
    });

    await expect(invitationCard).toBeVisible();
    await invitationCard.click();

    await expect(page).toHaveURL(new RegExp(`/invitations/${inboxFixture.participantId}`));
    await expect(page.getByRole('heading', { name: fixtureTitles.inbox })).toBeVisible();
    await expect(page.getByText(/Konfirmasi kehadiran Anda untuk rapat ini/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Terima Undangan/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tolak Undangan/i })).toBeVisible();
  });

  test('Peserta dapat menerima undangan meeting', async ({ page }) => {
    await page.goto(`/invitations/${acceptFixture.participantId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: fixtureTitles.accept })).toBeVisible();

    await page.getByRole('button', { name: /Terima Undangan/i }).click();

    await expect(page).toHaveURL(
      new RegExp(`/invitations/${acceptFixture.participantId}\\?success=confirmed`)
    );

    await expect(
      page.getByText(/Status undangan ini sudah diperbarui dan tidak dapat diubah lagi/i)
    ).toBeVisible();

    await expect(page.getByRole('button', { name: /Terima Undangan/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Tolak Undangan/i })).toHaveCount(0);
  });

  test('Peserta dapat menolak undangan meeting', async ({ page }) => {
    await page.goto(`/invitations/${declineFixture.participantId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: fixtureTitles.decline })).toBeVisible();

    await page.getByRole('button', { name: /Tolak Undangan/i }).click();

    await expect(page).toHaveURL(
      new RegExp(`/invitations/${declineFixture.participantId}\\?success=declined`)
    );

    await expect(
      page.getByText(/Status undangan ini sudah diperbarui dan tidak dapat diubah lagi/i)
    ).toBeVisible();

    await expect(page.getByRole('button', { name: /Terima Undangan/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Tolak Undangan/i })).toHaveCount(0);
  });
});