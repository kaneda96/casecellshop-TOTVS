import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [StockModule],
  controllers: [ProductsController],
})
export class ProductsModule {}
