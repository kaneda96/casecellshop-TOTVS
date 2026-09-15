import { Injectable, LoggerService, Scope } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Pasta dos arquivos de log: `<backend>/logs`, de propósito FORA de `src/` e de
 * `dist/` — não se mistura com o código e não é apagada num build limpo.
 *
 * O caminho sai de `__dirname` (e não do `process.cwd()`) para dar o mesmo
 * resultado rodando os fontes (`src/common/service/custom-logger`) ou o build
 * (`dist/common/service/custom-logger`).
 */
export const LOGS_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'logs');
export const LOG_FILE = path.join(LOGS_DIR, 'app.log');

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'VERBOSE';

let logsDirEnsured = false;

function ensureLogsDir(): void {
  if (logsDirEnsured) return;
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  logsDirEnsured = true;
}

/**
 * Logger da aplicação: escreve no console (legível) e em `logs/app.log`
 * (uma linha JSON por evento).
 *
 * Como implementa `LoggerService`, pode ser usado de duas formas:
 * - injetado por DI (`constructor(private logger: CustomLoggerService)`);
 * - como logger global do Nest via `app.useLogger(...)`, o que faz também os
 *   `new Logger(NomeDaClasse)` espalhados pelo código escreverem no arquivo.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class CustomLoggerService implements LoggerService {
  private context = 'App';

  /** Marca de onde veio o log — mesmo nome de API do `ConsoleLogger` do Nest. */
  setContext(context: string): this {
    this.context = context;
    return this;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('INFO', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('ERROR', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('WARN', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('DEBUG', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('VERBOSE', message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    const params = [...optionalParams];
    const context = this.extractContext(params);

    const entry = {
      time: new Date().toISOString(),
      level,
      context,
      message: formatValue(message),
      ...(params.length > 0 ? { details: params.map(formatValue) } : {}),
    };

    this.printToConsole(entry);

    // `appendFileSync` (e não uma escrita async): mantém a ordem dos eventos e
    // garante que o log já esteja em disco, inclusive se o processo morrer em
    // seguida. Para o volume deste projeto o custo é irrelevante.
    try {
      ensureLogsDir();
      fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (error) {
      // Falha ao gravar log nunca deve derrubar a requisição.
      console.error(`[CustomLogger] falha ao escrever em ${LOG_FILE}`, error);
    }
  }

  /**
   * O Nest chama `logger.log(mensagem, contexto)` e
   * `logger.error(mensagem, stack, contexto)`. O contexto é o último
   * parâmetro quando é uma string sem quebra de linha (stack tem quebra), o
   * que separa os dois casos sem ambiguidade.
   */
  private extractContext(params: unknown[]): string {
    const last = params[params.length - 1];
    if (typeof last === 'string' && !last.includes('\n')) {
      params.pop();
      return last;
    }
    return this.context;
  }

  private printToConsole(entry: { level: LogLevel; context: string; message: string; details?: string[] }): void {
    const prefix = `[${entry.level}] ${entry.context}`;
    const text = entry.details ? `${entry.message} ${entry.details.join(' ')}` : entry.message;

    if (entry.level === 'ERROR') console.error(`${prefix} ${text}`);
    else if (entry.level === 'WARN') console.warn(`${prefix} ${text}`);
    else console.log(`${prefix} ${text}`);
  }
}

/** Converte qualquer valor logado em texto (Error vira stack). */
function formatValue(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  return typeof value === 'string' ? value : JSON.stringify(value);
}