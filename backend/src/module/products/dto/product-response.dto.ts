import { ApiProperty } from '@nestjs/swagger';

export class ProductResponseDto {
  @ApiProperty({ example: 'cap-001' })
  id!: string;

  @ApiProperty({ example: 'Capinha iPhone 15 - Silicone Preta' })
  name!: string;

  @ApiProperty({ example: 4990, description: 'Preço em centavos (evita erro de ponto flutuante).' })
  price!: number;

  @ApiProperty({ example: 5, description: 'Estoque disponível já descontando reservas ativas (stock - reserved).' })
  available!: number;
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  products!: ProductResponseDto[];
}
