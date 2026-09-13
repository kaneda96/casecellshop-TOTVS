export interface Product {
  id: string;
  name: string;
  price: number; // cents
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
  errorCode?: string;
  message?: string;
}

export interface ApiErrorResponse {
  errorCode: string;
  message: string;
  retryable: boolean;
  orderId?: string;
}
