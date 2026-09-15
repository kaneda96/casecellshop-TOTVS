import { APIRequestContext, expect, test } from '@playwright/test';

export const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001';

export interface Product {
  id: string;
  name: string;
  price: number; // centavos
  available: number;
}

export type OrderStatus =
  | 'PROCESSING'
  | 'PENDING'
  | 'CONFIRMED'
  | 'FAILED_VALIDATION'
  | 'FAILED_STOCK'
  | 'FAILED_TEMPORARY';

export interface OrderResponse {
  orderId: string;
  status: OrderStatus;
  productId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  errorCode: string;
  message: string;
  retryable: boolean;
  orderId?: string;
}

export interface OrderResult {
  status: number;
  body: OrderResponse & Partial<ApiErrorBody>;
}

/**
 * Obtém um produto para o teste ou pula o teste com uma explicação — útil
 * porque o backend é stateful: se alguém já consumiu o estoque, o cenário
 * deixa de ser possível em vez de falhar de forma confusa.
 */
export function requireProduct(product: Product | undefined, reason: string): Product {
  if (!product) {
    test.skip(true, reason);
    throw new Error(reason); // inalcançável: test.skip interrompe o teste
  }
  return product;
}

export async function listProducts(request: APIRequestContext): Promise<Product[]> {
  const response = await request.get(`${BACKEND_URL}/products`);
  expect(response.ok(), `GET /products respondeu ${response.status()}`).toBe(true);
  const body = (await response.json()) as { products: Product[] };
  return body.products;
}

export async function availableOf(request: APIRequestContext, productId: string): Promise<number> {
  const product = (await listProducts(request)).find((p) => p.id === productId);
  if (!product) throw new Error(`Produto ${productId} não existe no catálogo do backend.`);
  return product.available;
}

/** Primeiro produto cujo estoque esteja na faixa pedida. */
export async function getAvailableProduct(
  request: APIRequestContext,
  minAvailable = 1,
  maxAvailable = 50
): Promise<Product | undefined> {
  const products = await listProducts(request);
  return products.find((p) => p.available >= minAvailable && p.available <= maxAvailable);
}

export async function createOrder(
  request: APIRequestContext,
  productId: string,
  quantity: number,
  idempotencyKey?: string
): Promise<OrderResult> {
  const response = await request.post(`${BACKEND_URL}/orders`, {
    data: { productId, quantity },
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
  });
  return { status: response.status(), body: (await response.json()) as OrderResult['body'] };
}

export async function getOrder(request: APIRequestContext, orderId: string): Promise<OrderResult> {
  const response = await request.get(`${BACKEND_URL}/orders/${orderId}`);
  return { status: response.status(), body: (await response.json()) as OrderResult['body'] };
}
