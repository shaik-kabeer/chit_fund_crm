import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuctionService } from './auction.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Auctions')
@ApiBearerAuth()
@Controller('auctions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuctionController {
  constructor(private auctionService: AuctionService) {}

  @Post('conduct')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Conduct/record an auction result' })
  async conduct(@CurrentUser() user: any, @Body() body: any) {
    return this.auctionService.conductAuction({
      ...body,
      conductedById: user.id,
      orgId: user.orgId,
    });
  }

  @Get('group/:groupId')
  @ApiOperation({ summary: 'Get auction history for a group' })
  async getGroupAuctions(
    @CurrentUser() user: any,
    @Param('groupId') groupId: string,
  ) {
    return this.auctionService.getGroupAuctions(groupId, user.orgId);
  }

  @Get('payouts/pending')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Get pending payouts' })
  async getPendingPayouts(@CurrentUser() user: any) {
    return this.auctionService.getPendingPayouts(user.orgId);
  }

  @Patch('payouts/:id/approve')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Approve a payout' })
  async approvePayout(@CurrentUser() user: any, @Param('id') id: string) {
    return this.auctionService.approvePayout(id, user.id, user.orgId);
  }

  @Patch('payouts/:id/complete')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Mark payout as completed' })
  async completePayout(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { transactionRef: string },
  ) {
    return this.auctionService.completePayout(id, body.transactionRef, user.orgId);
  }
}
