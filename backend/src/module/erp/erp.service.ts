import { Injectable } from '@nestjs/common';

export class ErpTransientError extends Error {
  constructor(message = 'ERP indisponível temporariamente') {
    super(message);
    this.name = 'ErpTransientError';
  }
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class ErpService {
  /**
   * Simula o processamento de faturamento no ERP legado descrito no case:
   * - 65% das vezes: sucesso rápido (300-900ms)
   * - 20% das vezes: sucesso lento (2500-4500ms) — dispara o timeout do
   *   lado do checkout, mas eventualmente confirma
   * - 15% das vezes: falha transitória (após 500-1500ms)
   */
  async processOrder(orderId: string): Promise<{ erpReference: string }> {
    const roll = Math.random();

    if (roll < 0.65) {
      await randomDelay(300, 900);
      return { erpReference: `ERP-${orderId.slice(0, 8)}` };
    }

    if (roll < 0.85) {
      await randomDelay(2500, 4500);
      return { erpReference: `ERP-${orderId.slice(0, 8)}` };
    }

    await randomDelay(500, 1500);
    throw new ErpTransientError();
  }
}
