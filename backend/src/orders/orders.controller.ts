import { Body, Controller, Get, Headers, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto';
import { Order } from './interfaces/order.interface';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Cria uma tentativa de compra (checkout)',
    description:
      'Reserva estoque de forma atômica e tenta confirmar o faturamento com o "ERP" simulado. ' +
      'Responde 201 se confirmar rápido, 202 se o ERP demorar (consulte GET /orders/:id depois), ' +
      'ou um erro (400/404/409/503) conforme o caso.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Chave única por tentativa de compra. Reenviar a mesma chave nunca cria um segundo pedido.',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 201, type: OrderResponseDto, description: 'Pedido confirmado' })
  @ApiResponse({ status: 202, type: OrderResponseDto, description: 'Pedido em processamento (ERP demorou)' })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'Payload inválido' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'Produto não encontrado' })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto, description: 'Estoque insuficiente' })
  @ApiResponse({ status: 503, type: ApiErrorResponseDto, description: 'Falha temporária do ERP (retryable)' })
  async create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response
  ): Promise<OrderResponseDto> {
    const { httpStatus, order } = await this.ordersService.createOrder(dto, idempotencyKey);
    res.status(httpStatus);
    return this.serialize(order);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta o status atual de um pedido (para polling após 202)' })
  @ApiParam({ name: 'id', example: '7400c4a2-8584-4a73-9bd4-5b07d0d9a290' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'Pedido não encontrado' })
  getOne(@Param('id') id: string): OrderResponseDto {
    const order = this.ordersService.getOrder(id); // lança OrderNotFoundException (404) se não existir
    return this.serialize(order);
  }

  private serialize(order: Order): OrderResponseDto {
    return {
      orderId: order.id,
      status: order.status,
      productId: order.productId,
      quantity: order.quantity,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
