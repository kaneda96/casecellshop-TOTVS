import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { winstonLogger } from './winston.config';

/**
 * Loga toda requisição HTTP em formato estruturado (JSON no arquivo,
 * legível no console), com um requestId para correlacionar múltiplas
 * linhas de log da mesma requisição — o "pouco de rastreabilidade" que o
 * case aponta como fraqueza do monitoramento atual do ERP.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = randomUUID();
    const start = Date.now();
    (req as Request & { requestId: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      winstonLogger.info('http_request', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
        ip: req.ip,
      });
    });

    next();
  }
}
