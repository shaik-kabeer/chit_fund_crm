import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InstallmentService } from './installment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Installments')
@ApiBearerAuth()
@Controller('installments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InstallmentController {
  constructor(private installmentService: InstallmentService) {}

  @Get('member/:memberId')
  async getForMember(@CurrentUser() user: any, @Param('memberId') memberId: string) {
    const customerId = user.type === 'customer' ? user.id : undefined;
    return this.installmentService.getForMember(memberId, customerId);
  }

  @Get('group/:groupId')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT', 'COLLECTOR')
  async getGroupInstallments(
    @Param('groupId') groupId: string,
    @Query('month') month?: string,
  ) {
    return this.installmentService.getGroupInstallments(groupId, month ? parseInt(month) : undefined);
  }

  @Get('overdue')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  async getOverdue(@CurrentUser() user: any) {
    return this.installmentService.getOverdueSummary(user.orgId);
  }
}
