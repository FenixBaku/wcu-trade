import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { OrderSide, OrderType, MarginMode } from '@prisma/client';

export class PlaceOrderDto {
  @IsString()
  symbol!: string; // internal symbol e.g. BTC-USDT

  @IsEnum(OrderSide)
  side!: OrderSide;

  @IsEnum(OrderType)
  type!: OrderType;

  @IsNumberString()
  quantity!: string;

  @IsOptional() @IsNumberString()
  limitPrice?: string;

  @IsOptional() @IsNumberString()
  stopPrice?: string;

  @IsOptional() @IsNumberString()
  takeProfitPrice?: string;

  @IsOptional() @IsNumberString()
  stopLossPrice?: string;

  @IsOptional() @IsNumberString()
  trailingDelta?: string;

  @IsOptional() @IsInt() @Min(1) @Max(125)
  leverage?: number;

  @IsOptional() @IsEnum(MarginMode)
  marginMode?: MarginMode;

  @IsOptional() @IsBoolean()
  reduceOnly?: boolean;

  @IsOptional() @IsString()
  clientOrderId?: string;
}

export class EditPositionDto {
  @IsOptional() @IsNumberString()
  takeProfitPrice?: string | null;

  @IsOptional() @IsNumberString()
  stopLossPrice?: string | null;
}
