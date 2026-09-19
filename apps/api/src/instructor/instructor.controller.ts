import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { Roles, CurrentUser, JwtUser } from '../common/decorators';
import { InstructorService } from './instructor.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('INSTRUCTOR', 'UNIVERSITY_ADMIN', 'SUPER_ADMIN')
@Controller('instructor')
export class InstructorController {
  constructor(private readonly instructor: InstructorService) {}

  @Get('classes')
  classes(@CurrentUser() user: JwtUser) {
    return this.instructor.listClasses(user.sub);
  }

  @Post('classes')
  createClass(@CurrentUser() user: JwtUser, @Body() body: any) {
    return this.instructor.createClass(user.sub, body);
  }

  @Get('classes/:id/students')
  students(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.instructor.classStudents(user.sub, id);
  }

  @Put('classes/:id/risk')
  risk(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.instructor.updateRiskSettings(user.sub, id, body);
  }

  @Post('accounts/:userId/reset')
  reset(@CurrentUser() user: JwtUser, @Param('userId') userId: string, @Body() body: any) {
    return this.instructor.resetAccount(user.sub, userId, body ?? {});
  }

  @Post('accounts/:userId/freeze')
  freeze(@CurrentUser() user: JwtUser, @Param('userId') userId: string) {
    return this.instructor.setAccountStatus(user.sub, userId, 'FROZEN');
  }

  @Post('accounts/:userId/unfreeze')
  unfreeze(@CurrentUser() user: JwtUser, @Param('userId') userId: string) {
    return this.instructor.setAccountStatus(user.sub, userId, 'ACTIVE');
  }

  @Post('accounts/:userId/suspend')
  suspend(@CurrentUser() user: JwtUser, @Param('userId') userId: string) {
    return this.instructor.setAccountStatus(user.sub, userId, 'SUSPENDED');
  }
}
