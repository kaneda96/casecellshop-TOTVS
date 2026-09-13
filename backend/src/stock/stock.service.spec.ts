import { Test, TestingModule } from '@nestjs/testing';
import { StockService } from './stock.service';
import { InsufficientStockException, ProductNotFoundException } from '../common/exceptions/domain.exceptions';

describe('StockService', () => {
  let service: StockService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StockService],
    }).compile();

    service = module.get(StockService);
  });

  it('lista os produtos do seed inicial', () => {
    const products = service.listProducts();
    expect(products.length).toBeGreaterThan(0);
  });

  it('reserva estoque disponível com sucesso', () => {
    service.reserveStock('cap-001', 1);
    const product = service.getProduct('cap-001');
    expect(product.reserved).toBe(1);
  });

  it('lança InsufficientStockException ao reservar além do disponível', () => {
    // cap-003 tem stock 0 no seed
    expect(() => service.reserveStock('cap-003', 1)).toThrow(InsufficientStockException);
  });

  it('lança ProductNotFoundException para produto inexistente', () => {
    expect(() => service.getProduct('inexistente')).toThrow(ProductNotFoundException);
  });

  it('confirmReservation debita o estoque definitivamente', () => {
    service.reserveStock('cap-004', 1); // stock 1 no seed
    service.confirmReservation('cap-004', 1);
    const product = service.getProduct('cap-004');
    expect(product.stock).toBe(0);
    expect(product.reserved).toBe(0);
  });

  it('releaseReservation libera a reserva sem debitar o estoque', () => {
    service.reserveStock('cap-004', 1);
    service.releaseReservation('cap-004', 1);
    const product = service.getProduct('cap-004');
    expect(product.stock).toBe(1);
    expect(product.reserved).toBe(0);
  });

  it('duas reservas concorrentes pela última unidade: só uma tem sucesso', () => {
    // cap-004 tem stock 1. Como reserveStock é síncrona, chamar duas vezes
    // em sequência reproduz a condição de corrida de "dois clientes ao
    // mesmo tempo" descrita no case.
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < 2; i++) {
      try {
        service.reserveStock('cap-004', 1);
        successCount++;
      } catch (err) {
        if (err instanceof InsufficientStockException) failureCount++;
        else throw err;
      }
    }

    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);
  });
});
