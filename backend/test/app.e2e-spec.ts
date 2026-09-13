import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { setupSwagger } from '../src/bootstrap/swagger';

describe('CaseCellShop Checkout API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Sobe a aplicação real (mesmos módulos, pipes e filtros do main.ts),
    // via configureApp compartilhado — não é um mock, é o app inteiro.
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /products', () => {
    it('retorna a lista de produtos com estoque disponível', async () => {
      const res = await request(app.getHttpServer()).get('/products');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBeGreaterThan(0);
      expect(res.body.products[0]).toHaveProperty('available');
    });
  });

  describe('GET /products/:id', () => {
    it('retorna 404 com o contrato de erro padrão para produto inexistente', async () => {
      const res = await request(app.getHttpServer()).get('/products/nao-existe');
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ errorCode: 'PRODUCT_NOT_FOUND', retryable: false });
    });
  });

  describe('POST /orders - validação (ValidationPipe + class-validator)', () => {
    it('retorna 400 VALIDATION_ERROR quando quantity está ausente', async () => {
      const res = await request(app.getHttpServer()).post('/orders').send({ productId: 'cap-001' });
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('retorna 400 quando quantity é zero', async () => {
      const res = await request(app.getHttpServer()).post('/orders').send({ productId: 'cap-001', quantity: 0 });
      expect(res.status).toBe(400);
    });

    it('retorna 400 quando o payload tem campos não esperados (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({ productId: 'cap-001', quantity: 1, campoInvalido: true });
      expect(res.status).toBe(400);
    });

    it('retorna 404 PRODUCT_NOT_FOUND quando o produto não existe', async () => {
      const res = await request(app.getHttpServer()).post('/orders').send({ productId: 'nao-existe', quantity: 1 });
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('POST /orders - estoque', () => {
    it('retorna 409 INSUFFICIENT_STOCK para produto sem estoque (cap-003)', async () => {
      const res = await request(app.getHttpServer()).post('/orders').send({ productId: 'cap-003', quantity: 1 });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('INSUFFICIENT_STOCK');
    });
  });

  describe('POST /orders - idempotência', () => {
    it('reenviar a mesma Idempotency-Key retorna o mesmo pedido, sem duplicar', async () => {
      const key = `e2e-idem-${Date.now()}`;

      const first = await request(app.getHttpServer())
        .post('/orders')
        .set('Idempotency-Key', key)
        .send({ productId: 'cap-001', quantity: 1 });

      const second = await request(app.getHttpServer())
        .post('/orders')
        .set('Idempotency-Key', key)
        .send({ productId: 'cap-001', quantity: 1 });

      expect(first.body.orderId).toBeTruthy();
      expect(second.body.orderId).toBe(first.body.orderId);
    }, 10000);
  });

  describe('POST /orders - concorrência na última unidade', () => {
    it('de duas compras simultâneas do mesmo produto com 1 unidade, só uma reserva com sucesso', async () => {
      // cap-004 tem 1 unidade no seed inicial.
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer()).post('/orders').send({ productId: 'cap-004', quantity: 1 }),
        request(app.getHttpServer()).post('/orders').send({ productId: 'cap-004', quantity: 1 }),
      ]);

      const errorCodes = [resA.body.errorCode, resB.body.errorCode].filter(Boolean);
      expect(errorCodes.filter((c) => c === 'INSUFFICIENT_STOCK')).toHaveLength(1);
    }, 10000);
  });

  describe('GET /orders/:id', () => {
    it('retorna 404 ORDER_NOT_FOUND para pedido inexistente', async () => {
      const res = await request(app.getHttpServer()).get('/orders/nao-existe');
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('ORDER_NOT_FOUND');
    });

    it('consulta o status de um pedido recém-criado', async () => {
      const created = await request(app.getHttpServer())
        .post('/orders')
        .send({ productId: 'cap-002', quantity: 1 });

      const res = await request(app.getHttpServer()).get(`/orders/${created.body.orderId}`);
      expect(res.status).toBe(200);
      expect(res.body.orderId).toBe(created.body.orderId);
    }, 10000);
  });

  describe('GET /docs (Swagger)', () => {
    it('expõe a documentação Swagger', async () => {
      const res = await request(app.getHttpServer()).get('/docs');
      expect([200, 301, 302]).toContain(res.status);
    });
  });
});
