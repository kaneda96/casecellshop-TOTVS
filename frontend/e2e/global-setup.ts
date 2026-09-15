import { request } from '@playwright/test';
import { BACKEND_URL } from './helpers/api';

/**
 * Falha cedo (e com mensagem útil) quando a API não está no ar, em vez de
 * deixar cada teste estourar timeout procurando por produtos na tela.
 */
export default async function globalSetup(): Promise<void> {
  const context = await request.newContext();
  try {
    const response = await context.get(`${BACKEND_URL}/health`);
    if (!response.ok()) {
      throw new Error(`healthcheck respondeu HTTP ${response.status()}`);
    }
  } catch (error) {
    throw new Error(
      `O backend não respondeu em ${BACKEND_URL}/health.\n` +
        'Suba a API antes de rodar os testes E2E:\n' +
        '  cd ../backend\n' +
        '  npx tsc -p tsconfig.build.json\n' +
        '  node dist/main.js\n' +
        `Detalhe: ${String(error)}`
    );
  } finally {
    await context.dispose();
  }
}
