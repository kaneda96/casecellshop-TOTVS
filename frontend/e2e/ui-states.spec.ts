import { expect, test } from '@playwright/test';
import { CheckoutPage } from './helpers/checkout-page';

/**
 * Estados que a UI precisa suportar mas que o backend real não consegue
 * produzir de forma determinística (o ERP simulado é aleatório e nunca fica
 * "pendurado" por tempo suficiente para observar o estado de erro).
 *
 * Aqui a rede é interceptada com `page.route` justamente para FORÇAR cada
 * estado. São testes de UI/contrato de interface, complementares às suítes que
 * batem no backend real (catalog.spec.ts, checkout.spec.ts, api-contract.spec.ts).
 */
const STUB_PRODUCT = {
  id: 'cap-stub',
  name: 'Capinha de Teste',
  price: 4990,
  available: 10,
};

function stubOrderBody(overrides: Record<string, unknown> = {}): string {
  const now = new Date().toISOString();
  return JSON.stringify({
    orderId: 'stub-order-1',
    status: 'CONFIRMED',
    productId: STUB_PRODUCT.id,
    quantity: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

/** Serve um catálogo fixo para manter estes testes hermeticamente fechados. */
async function stubCatalog(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/products', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ products: [STUB_PRODUCT] }),
    })
  );
}

async function openCheckout(page: import('@playwright/test').Page): Promise<CheckoutPage> {
  await stubCatalog(page);
  const checkout = new CheckoutPage(page);
  await checkout.goto();
  await checkout.waitForLoaded();
  return checkout;
}

test.describe('Estados de UI do checkout (rede interceptada)', () => {
  test('mostra "Enviando pedido...", desabilita o botão e ignora cliques extras', async ({
    page,
  }) => {
    const checkout = await openCheckout(page);
    let postCount = 0;

    await page.route('**/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      postCount++;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: stubOrderBody(),
      });
    });

    const button = checkout.buyButton(STUB_PRODUCT.name);
    await button.click();

    await expect(button).toBeDisabled();
    await expect(button).toContainText('Enviando pedido...');
    await expect(button.locator('.spinner-border')).toBeVisible();

    // Clique extra (evento sintético, que ignoraria o estado desabilitado do
    // DOM) não pode gerar uma segunda requisição: quem barra é o guard do
    // componente (`if (isBusy) return`).
    await button.dispatchEvent('click');

    await expect(checkout.successAlert(STUB_PRODUCT.name)).toBeVisible();
    expect(postCount, 'apenas uma requisição deve ter sido enviada').toBe(1);
  });

  test('trata 202 (ERP lento): mostra "Confirmando com o ERP..." e conclui via polling', async ({
    page,
  }) => {
    const checkout = await openCheckout(page);

    await page.route('**/orders', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: stubOrderBody({ status: 'PENDING', orderId: 'stub-pending-1' }),
          })
        : route.fallback()
    );

    let polls = 0;
    await page.route('**/orders/*', (route) => {
      polls++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: stubOrderBody({
          status: polls >= 2 ? 'CONFIRMED' : 'PENDING',
          orderId: 'stub-pending-1',
        }),
      });
    });

    await checkout.clickBuy(STUB_PRODUCT.name);

    await expect(checkout.buyButton(STUB_PRODUCT.name)).toContainText('Confirmando com o ERP...');
    await expect(checkout.successAlert(STUB_PRODUCT.name)).toBeVisible({ timeout: 20_000 });
    expect(polls, 'o pedido deve ser consultado mais de uma vez até confirmar').toBeGreaterThanOrEqual(2);
  });

  test('ERP indisponível (503): mensagem de falha temporária e botão de tentar novamente', async ({
    page,
  }) => {
    const checkout = await openCheckout(page);

    await page.route('**/orders', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              errorCode: 'ERP_UNAVAILABLE',
              message: 'Falha temporária ao confirmar o pedido no ERP.',
              retryable: true,
              orderId: 'stub-erp-1',
            }),
          })
        : route.fallback()
    );

    await checkout.clickBuy(STUB_PRODUCT.name);

    await expect(checkout.errorAlert(STUB_PRODUCT.name)).toContainText(
      'Falha temporária ao processar o pagamento. Tente novamente.'
    );
    await expect(checkout.retryButton(STUB_PRODUCT.name)).toBeVisible();
    await expect(checkout.buyButton(STUB_PRODUCT.name)).toBeEnabled();
  });

  test('backend fora do ar: mostra erro de carregamento em vez de tela vazia', async ({ page }) => {
    await page.route('**/products', (route) => route.abort('failed'));

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    await checkout.waitForLoadError();

    await expect(page.getByRole('alert')).toContainText(
      'Não foi possível carregar os produtos. O backend está rodando?'
    );
  });

  /**
   * Documenta um problema conhecido, encontrado ao escrever estes testes.
   *
   * `ProductCard.tsx` marca ERP_UNAVAILABLE como `retryable: true` e o botão
   * "Tentar novamente" chama `handleBuy(true)`, que reaproveita a mesma
   * Idempotency-Key. No backend, uma chave que já falhou responde 503 para
   * sempre (`orders.service.ts` relança `ErpUnavailableException` para pedidos
   * `FAILED_TEMPORARY`). Resultado: o botão fica em loop permanente, embora o
   * README do frontend diga que nesse caso deveria ser gerada uma nova chave.
   *
   * Use `test.fixme` (em vez de um teste que falha) para não quebrar o CI: o
   * teste roda como "pendente" e passa a valer quando o comportamento for
   * corrigido — basta remover o `.fixme`.
   */
  test.fixme('tentar novamente após ERP_UNAVAILABLE deve enviar uma NOVA Idempotency-Key', async ({
    page,
  }) => {
    const checkout = await openCheckout(page);
    const sentKeys: string[] = [];

    await page.route('**/orders', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      sentKeys.push(route.request().headers()['idempotency-key'] ?? '');
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          errorCode: 'ERP_UNAVAILABLE',
          message: 'Falha temporária ao confirmar o pedido no ERP.',
          retryable: true,
          orderId: 'stub-erp-1',
        }),
      });
    });

    await checkout.clickBuy(STUB_PRODUCT.name);
    await checkout.retryButton(STUB_PRODUCT.name).click();
    await expect(checkout.errorAlert(STUB_PRODUCT.name)).toBeVisible();

    expect(sentKeys).toHaveLength(2);
    expect(sentKeys[1], 'o retry deveria abrir uma nova tentativa de compra').not.toBe(sentKeys[0]);
  });
});
