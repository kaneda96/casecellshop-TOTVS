import { Test, TestingModule } from '@nestjs/testing';
import { CustomLoggerService } from './custom-logger.service';

describe('CustomLoggerService', () => {
  let service: CustomLoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomLoggerService],
    }).compile();

    // O provider é TRANSIENT: `get()` não aceita providers com escopo, então o
    // teste precisa de `resolve()`.
    service = await module.resolve<CustomLoggerService>(CustomLoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
