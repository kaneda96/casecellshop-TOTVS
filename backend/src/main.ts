import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { setupSwagger } from './bootstrap/swagger';
import { createNestWinstonLogger, LOGS_DIR } from './logging/winston.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: createNestWinstonLogger(),
  });

  configureApp(app);
  setupSwagger(app);

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);

  console.log(`CaseCellShop checkout API (NestJS) rodando em http://localhost:${port}`);
  console.log(`Documentação Swagger em http://localhost:${port}/docs`);
  console.log(`Logs sendo gravados em ${LOGS_DIR}`);
}

bootstrap();
