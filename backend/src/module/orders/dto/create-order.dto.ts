import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 'cap-001', description: 'Id do produto a ser comprado.' })
  @IsString({ message: 'productId deve ser uma string.' })
  @IsNotEmpty({ message: 'productId é obrigatório.' })
  productId!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 50, description: 'Quantidade desejada (inteiro entre 1 e 50).' })
  @IsInt({ message: 'quantity deve ser um número inteiro.' })
  @Min(1, { message: 'quantity deve ser no mínimo 1.' })
  @Max(50, { message: 'quantity deve ser no máximo 50.' })
  quantity!: number;
}
