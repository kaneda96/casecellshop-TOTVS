import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { CustomLoggerService } from '../service/custom-logger/custom-logger.service';

/**
 * Uma linha de log por request HTTP (metodo, rota, status e duracao) — da para
 * reconstruir o que aconteceu numa compra so pelo arquivo de log.
 *
 * O `CustomLoggerService` vem por injecao para que o log da rota escreva no
 * mesmo destino (console + `logs/app.log`) que o resto da aplicacao.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: CustomLoggerService) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    const describe = (status: number) =>
      `${request.method} ${request.originalUrl} ${status} - ${Date.now() - startedAt}ms`;

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(describe(response.statusCode)),
        error: (error: unknown) => {
          // Na camada de erro o `statusCode` da resposta ainda nao foi
          // atualizado pelo filtro global, entao o status sai da excecao.
          const status = error instanceof HttpException ? error.getStatus() : 500;
          const line = describe(status);

          if (status >= 500) {
            this.logger.error(line, error instanceof Error ? error.stack : error);
          } else {
            this.logger.warn(line);
          }
        },
      }),
    );
  }
}