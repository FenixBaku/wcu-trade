import { Body, Controller, Delete, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, JwtUser } from '../common/decorators';
import { TradingService } from './trading.service';
import { PlaceOrderDto, EditPositionDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class TradingController {
  constructor(private readonly trading: TradingService) {}

  @Post('orders')
  place(@CurrentUser() user: JwtUser, @Body() dto: PlaceOrderDto, @Req() req: any) {
    return this.trading.placeOrder(user.sub, dto, { ip: req.ip });
  }

  @Delete('orders/:id')
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.trading.cancelOrder(user.sub, id);
  }

  @Post('orders/cancel-all')
  cancelAll(@CurrentUser() user: JwtUser) {
    return this.trading.cancelAll(user.sub);
  }

  @Post('positions/:id/close')
  close(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.trading.closePosition(user.sub, id);
  }

  @Post('positions/close-all')
  closeAll(@CurrentUser() user: JwtUser) {
    return this.trading.closeAll(user.sub);
  }

  @Post('positions/:id/tpsl')
  editTpSl(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: EditPositionDto) {
    return this.trading.editPositionTpSl(user.sub, id, dto);
  }
}
