import { Module } from '@nestjs/common';
import { ChitGroupService } from './chit-group.service';
import { ChitGroupController } from './chit-group.controller';

@Module({
  controllers: [ChitGroupController],
  providers: [ChitGroupService],
  exports: [ChitGroupService],
})
export class ChitGroupModule {}
