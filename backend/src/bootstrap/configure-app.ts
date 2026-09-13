import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

/**
 * Configuração compartilhada entre a aplicação real (main.ts) e os testes
 * e2e, para garantir que os testes rodem exatamente com o mesmo
 * comportamento (validação, formato de erro) que a aplicação em produção.
 */
export function configureApp(app: INestApplication): void {
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos não esperados do payload
      forbidNonWhitelisted: true, // rejeita payload com campos extras
      transform: true, // converte tipos (ex: string -> number) antes da validação
    })
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}
