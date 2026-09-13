import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 'INSUFFICIENT_STOCK', description: 'Código estável para o front-end tratar por código, não por texto.' })
  errorCode!: string;

  @ApiProperty({ example: 'Estoque insuficiente para concluir a compra.', description: 'Mensagem amigável, pode ser exibida ao usuário.' })
  message!: string;

  @ApiProperty({ example: false, description: 'Indica se faz sentido o front-end oferecer "tentar novamente".' })
  retryable!: boolean;

  @ApiPropertyOptional({ example: '7400c4a2-8584-4a73-9bd4-5b07d0d9a290', description: 'Presente quando o erro está associado a um pedido já criado.' })
  orderId?: string;
}
