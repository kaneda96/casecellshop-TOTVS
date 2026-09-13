import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('CaseCellShop — Checkout API')
    .setDescription(
      'API de demonstração do fluxo de checkout de capinhas de celular, feita para o desafio técnico ' +
        'CaseCellShop. Cobre listagem de produtos, criação de pedido (com idempotência e timeout do ERP ' +
        'simulado) e consulta de status do pedido.'
    )
    .setVersion('1.0')
    .addTag('products', 'Catálogo e estoque disponível')
    .addTag('orders', 'Checkout: criação e consulta de pedidos')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
