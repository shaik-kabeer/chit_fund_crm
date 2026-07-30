import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Get('org-info')
  @ApiOperation({ summary: 'Get org UPI / payment instructions for members' })
  async getOrgPaymentInfo(@CurrentUser() user: any) {
    return this.paymentService.getOrgPaymentInfo(user.orgId);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Raise a payment request (UPI+screenshot or cash)' })
  async submit(@CurrentUser() user: any, @Body() body: any) {
    return this.paymentService.submitPayment({
      ...body,
      customerId: user.type === 'customer' ? user.id : undefined,
      collectedById: user.type === 'staff' ? user.id : undefined,
    });
  }

  @Patch(':id/verify')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Verify/approve a pending payment (marks received)' })
  async verify(@CurrentUser() user: any, @Param('id') id: string) {
    return this.paymentService.verifyPayment(id, user.id, user.orgId);
  }

  @Patch(':id/reject')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Reject a pending payment request' })
  async reject(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.paymentService.rejectPayment(id, body.reason, user.id, user.orgId);
  }

  @Get('pending')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR', 'ACCOUNTANT')
  @ApiOperation({ summary: 'List pending payment requests for verification' })
  async getPending(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentService.getPendingPayments(
      user.orgId,
      page ? parseInt(page) : 1,
      limit ? Math.min(parseInt(limit) || 20, 100) : 20,
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Get payment history (customer)' })
  async getHistory(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const customerId = user.type === 'customer' ? user.id : undefined;
    if (!customerId) {
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrev: false } };
    }
    return this.paymentService.getPaymentHistory(
      customerId,
      page ? parseInt(page) : 1,
      limit ? Math.min(parseInt(limit) || 20, 100) : 20,
    );
  }
}
