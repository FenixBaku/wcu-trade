import { Global, Module } from '@nestjs/common';
import { FeeService, SlippageService, SpreadService } from './pricing.services';
import { SimulationExecutionProvider } from './execution.provider';

@Global()
@Module({
  providers: [FeeService, SlippageService, SpreadService, SimulationExecutionProvider],
  exports: [FeeService, SlippageService, SpreadService, SimulationExecutionProvider],
})
export class ExecutionModule {}
