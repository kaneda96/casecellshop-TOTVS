import { defineConfig, devices } from '@playwright/test';

const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173';
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001';
const BACKEND_PORT = new URL(BACKEND_URL).port || '3001';

/**
 * Testes end-to-end do checkout contra o backend REAL (NestJS em
 * http://localhost:3001). O backend guarda estoque/pedidos em memória, então
 * as duas decisões abaixo são intencionais:
 *
 * - `workers: 1` + `fullyParallel: false`: como o estoque é compartilhado por
 *   todo o processo do backend, testes em paralelo disputariam as mesmas
 *   unidades e ficariam instáveis.
 * - `reuseExistingServer`: se você já tem a API rodando, ela é reaproveitada
 *   (o estado atual do estoque é respeitado pelos testes, que leem a API antes
 *   de agir). Em CI, o Playwright sobe um processo novo e limpo.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  globalSetup: './e2e/global-setup.ts',

  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  // O caminho lento do simulador de ERP leva ao fluxo 202 + polling (até 15s).
  timeout: 90_000,
  expect: { timeout: 15_000 },

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: FRONTEND_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // O backend não tem @nestjs/cli instalado (os scripts `npm start` e
      // `npm run start:dev` falham), então o start confiável é compilar com
      // tsc e executar o build gerado.
      command: 'npx tsc -p ../backend/tsconfig.build.json && node ../backend/dist/main.js',
      url: `${BACKEND_URL}/health`,
      env: { PORT: BACKEND_PORT },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run dev',
      url: FRONTEND_URL,
      env: { VITE_API_BASE_URL: BACKEND_URL },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
