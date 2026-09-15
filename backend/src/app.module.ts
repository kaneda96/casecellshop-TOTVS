import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ProductsModule } from './module/products/products.module';
import { OrdersModule } from './module/orders/orders.module';
import { HealthController } from './health.controller';
import { CustomLoggerService } from './common/service/custom-logger/custom-logger.service';
import { LoggingInterceptor } from './common/interceptors/logging.interceptors';

@Module({
  imports: [ProductsModule, OrdersModule],
  controllers: [HealthController],
  providers: [
    CustomLoggerService,
    // APP_INTERCEPTOR (e nao useGlobalInterceptors) para que o interceptor
    // tambem seja aplicado nos testes e2e, que montam o AppModule direto.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
