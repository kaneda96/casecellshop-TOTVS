import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import { WinstonModule, utilities as nestWinstonUtilities } from 'nest-winston';

// "Pasta externa" pedida no ajuste: os logs ficam em backend/logs/, fora de
// src/ e de dist/, para não se misturar com código-fonte nem ser apagados
// a cada rebuild. Funciona tanto em dev (ts-node-dev, __dirname = src/logging)
// quanto em produção (dist/logging), pois os dois estão a exatamente dois
// níveis de distância da raiz do backend.
export const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

fs.mkdirSync(LOGS_DIR, { recursive: true });

const fileFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

export const winstonLoggerOptions: winston.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // Console: formato legível por humanos durante o desenvolvimento.
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        nestWinstonUtilities.format.nestLike('CaseCellShop', { colors: true, prettyPrint: true })
      ),
    }),
    // Arquivo com todos os níveis - histórico completo, com rotação por tamanho.
    new winston.transports.File({
      dirname: LOGS_DIR,
      filename: 'combined.log',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    // Arquivo dedicado só a erros - facilita achar problemas em produção
    // sem precisar filtrar o log completo.
    new winston.transports.File({
      dirname: LOGS_DIR,
      filename: 'error.log',
      level: 'error',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
};

/** Logger usado como logger global do Nest (app.get(Logger), this.logger.log(...), etc.). */
export function createNestWinstonLogger() {
  return WinstonModule.createLogger(winstonLoggerOptions);
}

/** Logger "cru" do winston, reaproveitado pelo middleware de log de requisições. */
export const winstonLogger = winston.createLogger(winstonLoggerOptions);
