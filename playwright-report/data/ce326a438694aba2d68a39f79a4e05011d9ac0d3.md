# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 1_dashboard.spec.js >> Skenario 1 & 2: Dashboard >> Akses Dashboard Utama setelah Login
- Location: tests\1_dashboard.spec.js:4:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('input[name="email"]')

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e8]:
    - generic [ref=e9]:
      - heading "Welcome back" [level=1] [ref=e10]
      - paragraph [ref=e11]: Login to your account
    - group [ref=e12]:
      - generic [ref=e13]: Username
      - textbox "Username" [ref=e14]:
        - /placeholder: admin
    - group [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]: Password
        - link "Forgot your password?" [ref=e18] [cursor=pointer]:
          - /url: "#"
      - textbox "Password" [ref=e19]
    - group [ref=e20]:
      - button "Login" [ref=e21]
    - paragraph [ref=e22]:
      - text: Don't have an account?
      - link "Sign up" [ref=e23] [cursor=pointer]:
        - /url: "#"
  - paragraph [ref=e24]:
    - text: By clicking continue, you agree to our
    - link "Terms of Service" [ref=e25] [cursor=pointer]:
      - /url: "#"
    - text: and
    - link "Privacy Policy" [ref=e26] [cursor=pointer]:
      - /url: "#"
    - text: .
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Skenario 1 & 2: Dashboard', () => {
  4  |   test('Akses Dashboard Utama setelah Login', async ({ page }) => {
  5  |     let email = 'ahmad@example.com';
  6  |     let password = 'password123';
  7  | 
  8  |     await page.goto('/login');
> 9  |     await page.fill('input[name="email"]', email);
     |                ^ Error: page.fill: Test timeout of 30000ms exceeded.
  10 |     await page.fill('input[name="password"]', password);
  11 |     await page.click('button[type="submit"]');
  12 | 
  13 |     // Pastikan URL berubah ke dashboard dan ada elemen judul
  14 |     await expect(page).toHaveURL(/\/dashboard/);
  15 |     let dashboardTitle = page.locator('h1', { hasText: 'Dashboard' });
  16 |     await expect(dashboardTitle).toBeVisible();
  17 |   });
  18 | });
```