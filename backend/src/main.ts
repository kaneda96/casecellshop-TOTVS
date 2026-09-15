import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { setupSwagger } from './bootstrap/swagger';
import { CustomLoggerService } from './common/service/custom-logger/custom-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  setupSwagger(app);

  // Torna o CustomLoggerService o logger global do Nest: além das rotas,
  // qualquer `new Logger(NomeDaClasse)` no código passa a escrever também em
  // `logs/app.log`.
  //
  // `resolve()` (e não `get()`) porque o provider é TRANSIENT: `get()` sempre
  // lança para providers com escopo request/transient.
  app.useLogger((await app.resolve(CustomLoggerService)).setContext('Nest'));

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);

  console.log(`CaseCellShop checkout API (NestJS) rodando em http://localhost:${port}`);
  console.log(`Documentação Swagger em http://localhost:${port}/docs`);
}

bootstrap();
