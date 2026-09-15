import { Injectable, Logger } from '@nestjs/common';
import { Product } from './product.interface';
import { seedProducts } from '../../data/products.seed';
import { ProductNotFoundException, InsufficientStockException } from '../../common/exceptions/domain.exceptions';

@Injectable()
export class StockService {
  // Estado em memória, encapsulado na instância do provider (o Nest cria um
  // singleton por padrão, então há um único Map por processo da aplicação —
  // mas cada TestingModule de teste cria a sua própria instância, isolada).
  private readonly products: Map<string, Product> = seedProducts();
   private readonly logger = new Logger(StockService.name);

  listProducts(): Product[] {
    return Array.from(this.products.values());
  }

  getProduct(productId: string): Product {
    const product = this.products.get(productId);
    if (!product) throw new ProductNotFoundException(productId);
    return product;
  }

  /**
   * Reserva estoque de forma síncrona. Por não conter nenhum `await`, esta
   * função roda do início ao fim antes que o event loop do Node possa
   * processar qualquer outra requisição — é isso que garante atomicidade
   * mesmo sob duas requisições concorrentes disputando a última unidade.
   */
  reserveStock(productId: string, quantity: number): void {
    const product = this.getProduct(productId);
    const available = product.stock - product.reserved;
    if (available < quantity) {
      throw new InsufficientStockException();
    }
    product.reserved += quantity;
  }

  confirmReservation(productId: string, quantity: number): void {
    const product = this.getProduct(productId);
    product.stock -= quantity;
    product.reserved -= quantity;
  }

  releaseReservation(productId: string, quantity: number): void {
    const product = this.getProduct(productId);
    product.reserved = Math.max(0, product.reserved - quantity);
  }
}
