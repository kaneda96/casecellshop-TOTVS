import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { winstonLogger } from '../../logging/winston.config';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // 1) Erros de validação do ValidationPipe (class-validator) chegam como
    // BadRequestException padrão do Nest, com uma lista de mensagens.
    // Normalizamos para o mesmo contrato { errorCode, message, retryable }.
    if (exception instanceof BadRequestException) {
      const body = exception.getResponse() as { message?: string | string[] };
      const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
      response.status(HttpStatus.BAD_REQUEST).json({
        errorCode: 'VALIDATION_ERROR',
        message: message || 'Payload inválido.',
        retryable: false,
      });
      return;
    }

    // 2) Exceções de domínio (AppException e subclasses) já vêm no formato
    // certo — apenas repassamos o corpo montado por elas.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(body);
      return;
    }

    // 3) Qualquer outro erro não previsto: loga (console + arquivo) para
    // investigação e nunca vaza detalhes internos para o cliente.
    winstonLogger.error('unhandled_error', {
      message: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      errorCode: 'INTERNAL_ERROR',
      message: 'Erro interno inesperado.',
      retryable: true,
    });
  }
}
