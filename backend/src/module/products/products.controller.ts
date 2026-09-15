import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StockService } from '../stock/stock.service';
import { ProductListResponseDto, ProductResponseDto } from './dto/product-response.dto';
import { ApiErrorResponseDto } from '../../common/dto/api-error-response.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  @ApiOperation({ summary: 'Lista o catálogo com o estoque disponível de cada produto' })
  @ApiResponse({ status: 200, type: ProductListResponseDto })
  list(): ProductListResponseDto {
    const products = this.stockService.listProducts().map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      available: Math.max(0, p.stock - p.reserved),
    }));
    return { products };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um produto específico pelo id' })
  @ApiParam({ name: 'id', example: 'cap-001' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'Produto não encontrado' })
  getOne(@Param('id') id: string): ProductResponseDto {
    const p = this.stockService.getProduct(id); // lança ProductNotFoundException (404) se não existir
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      available: Math.max(0, p.stock - p.reserved),
    };
  }
}
