import { expect } from '@playwright/test';

export const ACCOUNTS = {
  HOST_AHMAD: {
    username: '2411521016_ahmad@student.unand.ac.id',
    password: '12345678',
  },

  HOST_LYVIA: {
    username: '2411521006_lyvia@student.unand.ac.id',
    password: 'Lyvia1234',
  },
};

export async function loginByRequest(page, account = ACCOUNTS.HOST_AHMAD) {
  const response = await page.request.post('/login', {
    form: {
      username: account.username,
      password: account.password,
    },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe('/home');

  await page.goto('/home', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible();
}

export async function logout(page) {
  await page.getByRole('link', { name: /Keluar Akun/i }).click();

  await expect(page).toHaveURL(/\/login/);
}