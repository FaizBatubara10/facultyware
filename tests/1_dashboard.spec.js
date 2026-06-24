import { test, expect } from '@playwright/test';

const HOST = { username: '2411521016_ahmad@student.unand.ac.id', password: '12345678' };

async function login(page, username, password) {
  await page.goto('http://localhost:3000/login');
  await page.getByRole('textbox', { name: 'Username' }).fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

async function logout(page) {
  await page.getByRole('link', { name: 'Keluar Akun' }).click();
}

test.describe('Auth Module', () => {
  test('Login with valid credentials and logout', async ({ page }) => {
    await login(page, HOST.username, HOST.password);
    await expect(page).toHaveURL(/home/, { timeout: 15000 });
    await logout(page);
    await expect(page).toHaveURL(/login/);
  });

  test('Login with invalid credentials', async ({ page }) => {
    await login(page, 'wrong@example.com', 'wrongpassword');
    await expect(page).not.toHaveURL(/home/, { timeout: 15000 });
  });
});