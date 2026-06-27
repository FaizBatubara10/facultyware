import { test, expect } from '@playwright/test';

const HOST = {
  username: '2411521016_ahmad@student.unand.ac.id',
  password: '12345678',
};

const LYVIA = {
  username: '2411521006_lyvia@student.unand.ac.id',
  password: 'Lyvia1234',
};

async function openLoginPage(page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#username')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
}

async function loginByRequest(page, account = HOST) {
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

test.describe('Authentication Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('User yang belum login diarahkan ke halaman login', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('Login berhasil dengan akun valid', async ({ page }) => {
    await loginByRequest(page, HOST);
  });

  test('Login gagal dengan email atau password salah', async ({ page }) => {
    await openLoginPage(page);

    await page.locator('#username').fill('wrong@example.com');
    await page.locator('#password').fill('wrongpassword');

    await page.locator('form[action="/login"] button[type="submit"]').click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible();
  });

  test('Logout berhasil dan kembali ke halaman login', async ({ page }) => {
    await loginByRequest(page, LYVIA);

    await page.getByRole('link', { name: /Keluar Akun/i }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#username')).toBeVisible();
  });
});