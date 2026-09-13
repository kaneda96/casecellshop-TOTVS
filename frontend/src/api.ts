import { ApiErrorResponse, OrderResponse, Product } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class ApiRequestError extends Error {
  errorCode: string;
  retryable: boolean;
  status: number;
  orderId?: string;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.message);
    this.status = status;
    this.errorCode = body.errorCode;
    this.retryable = body.retryable;
    this.orderId = body.orderId;
  }
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE_URL}/products`);
  if (!res.ok) throw new Error('Falha ao carregar produtos.');
  const data = await res.json();
  return data.products;
}

export async function createOrder(
  productId: string,
  quantity: number,
  idempotencyKey: string
): Promise<{ status: number; body: OrderResponse }> {
  const res = await fetch(`${API_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ productId, quantity }),
  });
  const body = await res.json();

  if (!res.ok && body.errorCode) {
    throw new ApiRequestError(res.status, body as ApiErrorResponse);
  }

  return { status: res.status, body: body as OrderResponse };
}

export async function fetchOrder(orderId: string): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE_URL}/orders/${orderId}`);
  const body = await res.json();
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiErrorResponse);
  return body as OrderResponse;
}

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
