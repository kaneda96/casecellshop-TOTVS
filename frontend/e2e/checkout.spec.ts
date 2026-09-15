import { expect, test } from '@playwright/test';
import { getAvailableProduct, listProducts, requireProduct } from './helpers/api';
import { CheckoutPage } from './helpers/checkout-page';

/**
 * Fluxo de compra contra o backend real. Os cenários de erro são
 * determinísticos (não dependem do ERP); o caminho de sucesso é repetido até
 * confirmar, porque o simulador de ERP do backend tem 15% de falha transitória.
 */
test.describe('Checkout (backend real)', () => {
  test('compra unitária confirma o pedido e reduz o estoque em 1', async ({ page, request }) => {
    const product = requireProduct(
      await getAvailableProduct(request, 1, 49),
      'Nenhum produto com estoque disponível para testar a compra.'
    );

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    await checkout.waitForLoaded();

    await checkout.purchaseUntilConfirmed(product.name, 1);

    await expect(checkout.successAlert(product.name)).toContainText('Pedido confirmado');

    const after = (await listProducts(request)).find((p) => p.id === product.id)!;
    expect(after.available, 'uma compra confirmada consome exatamente 1 unidade').toBe(
      product.available - 1
    );
  });

  test('estoque insuficiente: mensagem clara, sem retry e sem consumir estoque', async ({
    page,
    request,
  }) => {
    // Um produto com 1..49 unidades permite pedir uma quantidade acima do
    // estoque mantendo-se dentro do limite de 50 aceito pelo backend.
    const product = requireProduct(
      await getAvailableProduct(request, 1, 49),
      'Nenhum produto com estoque na faixa 1..49 para simular venda acima do disponível.'
    );
    const oversell = product.available + 1;

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    await checkout.waitForLoaded();

    await checkout.setQuantity(product.name, oversell);
    await checkout.clickBuy(product.name);

    await expect(checkout.errorAlert(product.name)).toContainText(
      'Estoque insuficiente para essa quantidade.'
    );
    // Falha não recuperável: não faz sentido oferecer "Tentar novamente".
    await expect(checkout.retryButton(product.name)).toHaveCount(0);

    const after = (await listProducts(request)).find((p) => p.id === product.id)!;
    expect(after.available, 'tentativa rejeitada não pode reservar estoque').toBe(product.available);
  });

  test('entrada inválida (quantidade 0): mostra a mensagem de validação do backend', async ({
    page,
    request,
  }) => {
    const product = requireProduct(
      await getAvailableProduct(request, 1),
      'Nenhum produto com estoque para testar a validação.'
    );

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    await checkout.waitForLoaded();

    // O input tem min={1}, mas o navegador ainda permite digitar 0 — quem
    // precisa recusar é a API (e a UI deve repassar a mensagem).
    await checkout.setQuantity(product.name, 0);
    await checkout.clickBuy(product.name);

    await expect(checkout.errorAlert(product.name)).toContainText('quantity deve ser no mínimo 1');
    await expect(checkout.retryButton(product.name)).toHaveCount(0);
  });

  test('envia o header Idempotency-Key e o payload esperado no POST /orders', async ({
    page,
    request,
  }) => {
    const product = requireProduct(
      await getAvailableProduct(request, 1, 49),
      'Nenhum produto com estoque na faixa 1..49 para inspecionar a requisição.'
    );
    // Quantidade acima do estoque de propósito: a requisição é enviada
    // (permitindo inspecionar headers/body) mas o backend responde 409 sem
    // consumir nenhuma unidade.
    const oversell = product.available + 1;

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    await checkout.waitForLoaded();

    const requestPromise = page.waitForRequest(
      (req) => req.method() === 'POST' && new URL(req.url()).pathname === '/orders'
    );

    await checkout.setQuantity(product.name, oversell);
    await checkout.clickBuy(product.name);

    const orderRequest = await requestPromise;
    expect(orderRequest.headers()['idempotency-key'], 'a UI deve enviar Idempotency-Key').toBeTruthy();
    expect(orderRequest.headers()['content-type']).toContain('application/json');
    expect(JSON.parse(orderRequest.postData() ?? '{}')).toEqual({
      productId: product.id,
      quantity: oversell,
    });
  });
});
