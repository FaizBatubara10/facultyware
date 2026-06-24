import { defineConfig, devices } from '@playwright/test';

// PENTING: Ganti angka 3000 di bawah ini dengan port yang kamu gunakan
// Misalnya jika kamu pakai Laravel biasanya 'http://localhost:8000'
// Jika pakai Live Server biasa mungkin 'http://127.0.0.1:5500'
let baseURL = 'http://localhost:3000'; 

export default defineConfig({
  /* Direktori tempat semua file 1_dashboard.spec.js sampai 6_api.spec.js berada */
  testDir: './tests',
  
  /* Waktu maksimal tunggu per satu tes */
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  
  /* Jalankan tes secara paralel agar cepat */
  fullyParallel: true,
  
  /* Set 0 agar kita bisa melihat error murni tanpa diulang-ulang dulu */
  retries: 0,
  
  /* Output laporan hasil testing berupa HTML */
  /* Output laporan: 'list' untuk di terminal per fitur, 'html' untuk versi web */
  reporter: [
    ['list'],
    ['html']
  ],
  
  /* Konfigurasi global */
  use: {
    /* Ini yang akan otomatis digabungkan dengan '/login' di script testingmu */
    baseURL: baseURL,

    /* Ambil screenshot kalau ada tes yang gagal (merah) */
    screenshot: 'only-on-failure',

    /* Simpan rekam jejak untuk debugging kalau gagal */
    trace: 'retain-on-failure',
  },

  /* Browser yang dites (kita fokus ke Chrome/Chromium saja dulu biar cepat) */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});