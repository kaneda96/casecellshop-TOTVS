import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StockService } from '../stock/stock.service';
import { ErpService } from '../erp/erp.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderResult, Order } from './interfaces/order.interface';
import { OrderNotFoundException, UnavailableException } from '../../common/exceptions/domain.exceptions';

const ERP_TIMEOUT_MS = 2000;

type RaceOutcome = 'SUCCESS' | 'ERROR' | 'TIMEOUT';

@Injectable()
export class OrdersService {
  // Estado em memória do provider (singleton por processo Nest).
  private readonly orders = new Map<string, Order>();
  // Idempotency-Key -> orderId, para que retries (duplo clique, retry de
  // rede) nunca criem um segundo pedido nem reservem estoque duas vezes.
  private readonly idempotencyIndex = new Map<string, string>();

  constructor(
    private readonly stockService: StockService,
    private readonly erpService: ErpService
  ) {}

  async createOrder(dto: CreateOrderDto, idempotencyKey?: string): Promise<CreateOrderResult> {
    // 1) Idempotência: se a chave já foi usada, devolve o resultado
    // existente em vez de processar de novo.
    if (idempotencyKey) {
      const existingId = this.idempotencyIndex.get(idempotencyKey);
      if (existingId) {
        const existing = this.orders.get(existingId)!;
        if (existing.status === 'FAILED_TEMPORARY') {
          // Mantém o mesmo formato de erro que a primeira tentativa teria
          // recebido, para o cliente não precisar distinguir "erro original"
          // de "replay de um pedido que falhou".
          throw new UnavailableException(existing.id);
        }
        return { httpStatus: existing.status === 'PENDING' ? 202 : 201, order: existing };
      }
    }

    // 2) Reserva de estoque - síncrona e atômica (ver StockService). Lança
    // ProductNotFoundException (404) ou InsufficientStockException (409)
    // automaticamente, que sobem direto para o filtro global de exceções.
    this.stockService.reserveStock(dto.productId, dto.quantity);

    // 3) Cria o pedido e registra a Idempotency-Key ANTES de qualquer
    // `await`, para que uma segunda requisição concorrente com a mesma
    // chave encontre o pedido já criado, em vez de reservar estoque de novo.
    const order: Order = {
      id: randomUUID(),
      idempotencyKey: idempotencyKey ?? randomUUID(),
      productId: dto.productId,
      quantity: dto.quantity,
      status: 'PROCESSING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(order.id, order);
    if (idempotencyKey) this.idempotencyIndex.set(idempotencyKey, order.id);

    // 4) Chama o "ERP" com timeout curto — o checkout nunca fica pendurado
    // esperando o ERP indefinidamente (resolve o problema 03 do case).
    const outcome = await this.raceErp(order.id);

    if (outcome === 'SUCCESS') {
      this.stockService.confirmReservation(order.productId, order.quantity);
      order.status = 'CONFIRMED';
      this.touch(order);
      return { httpStatus: 201, order };
    }

    if (outcome === 'ERROR') {
      this.stockService.releaseReservation(order.productId, order.quantity);
      order.status = 'FAILED_TEMPORARY';
      order.errorCode = 'ERP_UNAVAILABLE';
      order.errorMessage = 'Falha temporária ao confirmar o pedido no ERP.';
      this.touch(order);
      throw new UnavailableException(order.id);
    }

    // TIMEOUT: mantém a reserva (não libera estoque), responde 202 e deixa
    // o processamento real seguir em background. O cliente consulta
    // GET /orders/:id (polling) para saber o desfecho.
    order.status = 'PENDING';
    this.touch(order);
    this.watchInBackground(order);
    return { httpStatus: 202, order };
  }

  getOrder(orderId: string): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new OrderNotFoundException(orderId);
    return order;
  }

  private async raceErp(orderId: string): Promise<RaceOutcome> {
    const result = await Promise.race<{ outcome: RaceOutcome }>([
      this.erpService.processOrder(orderId).then(
        () => ({ outcome: 'SUCCESS' as const }),
        () => ({ outcome: 'ERROR' as const })
      ),
      new Promise<{ outcome: RaceOutcome }>((resolve) =>
        setTimeout(() => resolve({ outcome: 'TIMEOUT' }), ERP_TIMEOUT_MS)
      ),
    ]);
    return result.outcome;
  }

  private watchInBackground(order: Order): void {
    // Limitação assumida e documentada no README: esta é uma NOVA tentativa
    // contra o simulador de ERP, não o mesmo resultado da chamada original
    // que estourou o timeout. Em um sistema real, aqui reconectaríamos ao
    // resultado real (webhook do ERP, ou consulta de status no próprio ERP),
    // nunca reprocessaríamos o pedido do zero.
    this.erpService.processOrder(order.id).then(
      () => {
        const current = this.orders.get(order.id);
        if (current && current.status === 'PENDING') {
          this.stockService.confirmReservation(current.productId, current.quantity);
          current.status = 'CONFIRMED';
          this.touch(current);
        }
      },
      () => {
        const current = this.orders.get(order.id);
        if (current && current.status === 'PENDING') {
          this.stockService.releaseReservation(current.productId, current.quantity);
          current.status = 'FAILED_TEMPORARY';
          current.errorCode = 'ERP_UNAVAILABLE';
          current.errorMessage = 'Falha temporária ao confirmar o pedido no ERP (após timeout).';
          this.touch(current);
        }
      }
    );
  }

  private touch(order: Order): void {
    order.updatedAt = new Date().toISOString();
  }
}
