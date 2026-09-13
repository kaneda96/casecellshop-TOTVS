import { ApiProperty } from '@nestjs/swagger';

export class OrderResponseDto {
  @ApiProperty({ example: '7400c4a2-8584-4a73-9bd4-5b07d0d9a290' })
  orderId!: string;

  @ApiProperty({
    example: 'CONFIRMED',
    enum: ['PROCESSING', 'PENDING', 'CONFIRMED', 'FAILED_TEMPORARY'],
    description:
      'PROCESSING: recém-criado. PENDING: ERP demorou, aguardando confirmação assíncrona (fazer polling). ' +
      'CONFIRMED: faturado com sucesso. FAILED_TEMPORARY: falhou no ERP, reserva de estoque já liberada.',
  })
  status!: string;

  @ApiProperty({ example: 'cap-001' })
  productId!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: '2026-09-13T16:39:06.368Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-13T16:39:06.834Z' })
  updatedAt!: string;
}
