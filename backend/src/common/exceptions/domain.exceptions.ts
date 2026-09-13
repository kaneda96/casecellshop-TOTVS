import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

export class ProductNotFoundException extends AppException {
  constructor(productId: string) {
    super(HttpStatus.NOT_FOUND, {
      errorCode: 'PRODUCT_NOT_FOUND',
      message: `Produto ${productId} não encontrado.`,
      retryable: false,
    });
  }
}

export class OrderNotFoundException extends AppException {
  constructor(orderId: string) {
    super(HttpStatus.NOT_FOUND, {
      errorCode: 'ORDER_NOT_FOUND',
      message: `Pedido ${orderId} não encontrado.`,
      retryable: false,
    });
  }
}

export class InsufficientStockException extends AppException {
  constructor(orderId?: string) {
    super(HttpStatus.CONFLICT, {
      errorCode: 'INSUFFICIENT_STOCK',
      message: 'Estoque insuficiente para concluir a compra.',
      retryable: false,
      orderId,
    });
  }
}

export class ErpUnavailableException extends AppException {
  constructor(orderId: string) {
    super(HttpStatus.SERVICE_UNAVAILABLE, {
      errorCode: 'ERP_UNAVAILABLE',
      message: 'Falha temporária ao confirmar o pedido no ERP.',
      retryable: true,
      orderId,
    });
  }
}
