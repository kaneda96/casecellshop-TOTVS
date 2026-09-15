import { expect, test } from '@playwright/test';
import {
  BACKEND_URL,
  createOrder,
  getAvailableProduct,
  getOrder,
  listProducts,
  requireProduct,
} from './helpers/api';

/**
 * Contrato da API que o frontend consome (o que `src/api.ts` assume). Testar
 * isso no mesmo pacote dos testes de UI evita que o frontend quebre
 * silenciosamente quando o backend mudar o formato da resposta.
 */
test.describe('Contrato da API consumida pelo frontend', () => {
  test('GET /products devolve "products" com os campos usados pelos componentes', async ({
    request,
  }) => {
    const products = await listProducts(request);
    expect(products.length).toBeGreaterThan(0);

    for (const product of products) {
      expect(typeof product.id).toBe('string');
      expect(product.name.length).toBeGreaterThan(0);
      expect(Number.isInteger(product.price), 'price é inteiro em centavos').toBe(true);
      expect(product.price).toBeGreaterThan(0);
      expect(Number.isInteger(product.available)).toBe(true);
      expect(product.available).toBeGreaterThanOrEqual(0);
    }
  });

  test('a mesma Idempotency-Key nunca cria um segundo pedido nem reserva estoque duas vezes', async ({
    request,
  }) => {
    const product = requireProduct(
      await getAvailableProduct(request, 2),
      'Precisa de um produto com pelo menos 2 unidades para o teste de idempotência.'
    );
    const key = `e2e-idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const first = await createOrder(request, product.id, 1, key);
    const second = await createOrder(request, product.id, 1, key);

    expect(first.body.orderId, 'a primeira tentativa deve criar um pedido').toBeTruthy();
    expect(second.body.orderId, 'o replay deve devolver o MESMO pedido').toBe(first.body.orderId);
    expect([201, 202, 503], `status inesperado: ${first.status}`).toContain(first.status);
    expect([201, 202, 503], `status inesperado: ${second.status}`).toContain(second.status);

    const after = (await listProducts(request)).find((p) => p.id === product.id)!;
    // 201 consome 1 unidade; 202 mantém a reserva (pode consumir depois); 503 libera.
    expect(
      [product.available, product.available - 1],
      'duas requisições com a mesma chave não podem consumir mais de 1 unidade'
    ).toContain(after.available);
  });

  test('os erros seguem o contrato { errorCode, message, retryable }', async ({ request }) => {
    const productNotFound = await request.get(`${BACKEND_URL}/products/nao-existe`);
    expect(productNotFound.status()).toBe(404);
    expect(await productNotFound.json()).toMatchObject({
      errorCode: 'PRODUCT_NOT_FOUND',
      retryable: false,
    });

    const orderNotFound = await request.get(`${BACKEND_URL}/orders/nao-existe`);
    expect(orderNotFound.status()).toBe(404);
    expect(await orderNotFound.json()).toMatchObject({
      errorCode: 'ORDER_NOT_FOUND',
      retryable: false,
    });

    const invalidPayload = await request.post(`${BACKEND_URL}/orders`, {
      data: { productId: 'cap-001', quantity: 0 },
    });
    expect(invalidPayload.status()).toBe(400);
    expect(await invalidPayload.json()).toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      retryable: false,
    });
  });

  test('GET /orders/:id permite acompanhar o pedido criado (fluxo de polling do 202)', async ({
    request,
  }) => {
    const product = requireProduct(
      await getAvailableProduct(request, 1),
      'Nenhum produto com estoque para criar um pedido de acompanhamento.'
    );

    const created = await createOrder(request, product.id, 1, `e2e-poll-${Date.now()}`);
    if (created.status !== 201 && created.status !== 202) {
      test.skip(true, `ERP simulador devolveu ${created.status}; não há pedido para acompanhar.`);
      return;
    }

    const fetched = await getOrder(request, created.body.orderId);
    expect(fetched.status).toBe(200);
    expect(fetched.body.orderId).toBe(created.body.orderId);
    expect(['PROCESSING', 'PENDING', 'CONFIRMED', 'FAILED_TEMPORARY']).toContain(fetched.body.status);
  });
});
