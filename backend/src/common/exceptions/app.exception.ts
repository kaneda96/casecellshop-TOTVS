import { HttpException } from '@nestjs/common';

export interface AppErrorBody {
  errorCode: string;
  message: string;
  retryable: boolean;
  orderId?: string;
}

/**
 * Toda exceção de domínio da aplicação estende esta classe, garantindo que
 * o corpo da resposta de erro sempre tenha o mesmo formato:
 * { errorCode, message, retryable }. O filtro global (HttpExceptionFilter)
 * usa esse contrato para montar a resposta final ao cliente.
 */
export class AppException extends HttpException {
  constructor(status: number, body: AppErrorBody) {
    super(body, status);
  }
}
