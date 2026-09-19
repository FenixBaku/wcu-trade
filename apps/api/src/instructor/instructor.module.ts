import { Module } from '@nestjs/common';
import { InstructorService } from './instructor.service';
import { InstructorController } from './instructor.controller';
import { TradingModule } from '../trading/trading.module';

@Module({
  imports: [TradingModule],
  providers: [InstructorService],
  controllers: [InstructorController],
})
export class InstructorModule {}
