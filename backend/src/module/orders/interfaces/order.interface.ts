export type OrderStatus = 'PROCESSING' | 'PENDING' | 'CONFIRMED' | 'FAILED_TEMPORARY';

export interface Order {
  id: string;
  idempotencyKey: string;
  productId: string;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface CreateOrderResult {
  httpStatus: number;
  order: Order;
}
