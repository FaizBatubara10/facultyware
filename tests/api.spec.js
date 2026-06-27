import { test, expect } from '@playwright/test';
import { ACCOUNTS, loginByRequest } from './helpers/auth.js';

test.describe('REST API Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginByRequest(page, ACCOUNTS.HOST_AHMAD);
  });

  test('GET /api/meetings mengembalikan response JSON daftar meeting', async ({ page }) => {
    const response = await page.request.get('/api/meetings');

    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('id');
      expect(body.data[0]).toHaveProperty('title');
      expect(body.data[0]).toHaveProperty('status');
    }
  });

  test('GET /api/meetings/:id mengembalikan detail meeting', async ({ page }) => {
    const listResponse = await page.request.get('/api/meetings');
    const listBody = await listResponse.json();

    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.data.length).toBeGreaterThan(0);

    const meetingId = listBody.data[0].id;

    const detailResponse = await page.request.get(`/api/meetings/${meetingId}`);

    expect(detailResponse.ok()).toBeTruthy();

    const detailBody = await detailResponse.json();

    expect(detailBody.success).toBe(true);
    expect(detailBody.data).toHaveProperty('id', meetingId);
    expect(detailBody.data).toHaveProperty('title');
    expect(detailBody.data).toHaveProperty('status');
  });

  test('GET /api/minutes mengembalikan response JSON daftar notulensi', async ({ page }) => {
    const response = await page.request.get('/api/minutes');

    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('id');
      expect(body.data[0]).toHaveProperty('summary');
      expect(body.data[0]).toHaveProperty('file');
      expect(body.data[0]).toHaveProperty('created_at');

      expect(body.data[0]).toHaveProperty('meeting');
      expect(body.data[0].meeting).toHaveProperty('id');
      expect(body.data[0].meeting).toHaveProperty('title');
      expect(body.data[0].meeting).toHaveProperty('meeting_date');
      expect(body.data[0].meeting).toHaveProperty('status');
    }
  });

  test('GET /api/minutes/:id mengembalikan detail notulensi', async ({ page }) => {
    const listResponse = await page.request.get('/api/minutes');
    const listBody = await listResponse.json();

    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.data.length).toBeGreaterThan(0);

    const minuteId = listBody.data[0].id;

    const detailResponse = await page.request.get(`/api/minutes/${minuteId}`);

    expect(detailResponse.ok()).toBeTruthy();

    const detailBody = await detailResponse.json();

    expect(detailBody.success).toBe(true);
    expect(detailBody.data).toHaveProperty('id', minuteId);
    expect(detailBody.data).toHaveProperty('summary');
    expect(detailBody.data).toHaveProperty('file');
    expect(detailBody.data).toHaveProperty('created_at');

    expect(detailBody.data).toHaveProperty('meeting');
    expect(detailBody.data.meeting).toHaveProperty('id');
    expect(detailBody.data.meeting).toHaveProperty('title');
    expect(detailBody.data.meeting).toHaveProperty('meeting_date');
    expect(detailBody.data.meeting).toHaveProperty('status');
  });
});