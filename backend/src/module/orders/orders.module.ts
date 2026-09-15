import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { StockModule } from '../stock/stock.module';
import { ErpModule } from '../erp/erp.module';

@Module({
  imports: [StockModule, ErpModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
