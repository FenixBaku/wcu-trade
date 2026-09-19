import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, JwtUser } from '../common/decorators';
import { NotificationService } from './notification.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.notifications.list(user.sub);
  }

  @Post(':id/read')
  read(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.notifications.markRead(user.sub, id);
  }
}
