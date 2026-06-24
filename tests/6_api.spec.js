import { test, expect } from '@playwright/test';

const HOST = { username: '2411521016_ahmad@student.unand.ac.id', password: '12345678' };

test.describe('API Module', () => {
  test('GET /api/meetings returns JSON data', async ({ request, page }) => {
    await page.goto('http://localhost:3000/login');
    await page.getByRole('textbox', { name: 'Username' }).fill(HOST.username);
    await page.getByRole('textbox', { name: 'Password' }).fill(HOST.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/home/, { timeout: 15000 });

    const context = page.context();
    const cookies = await context.cookies();
    let cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const response = await request.get('http://localhost:3000/api/meetings', {
      headers: {
        'Cookie': cookieStr,
        'Accept': 'application/json'
      }
    });
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json).toHaveProperty('data');
  });
});