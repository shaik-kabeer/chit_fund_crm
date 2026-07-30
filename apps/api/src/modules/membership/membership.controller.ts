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
import { MembershipService } from './membership.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Memberships')
@ApiBearerAuth()
@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipController {
  constructor(private membershipService: MembershipService) {}

  @Post('join/:groupId')
  @Roles('CUSTOMER')
  @ApiOperation({ summary: 'Request one or more seats in a group (multi-seat allowed)' })
  async requestJoin(
    @CurrentUser() user: any,
    @Param('groupId') groupId: string,
    @Body() body: { seatLabel?: string; quantity?: number },
  ) {
    const customerId = user.type === 'customer' ? user.id : user.id;
    return this.membershipService.requestJoin(customerId, groupId, user.orgId, {
      seatLabel: body?.seatLabel,
      quantity: body?.quantity,
    });
  }

  @Post('admin-add-seat')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Admin adds another seat for a customer in a group' })
  async adminAddSeat(
    @CurrentUser() user: any,
    @Body() body: { groupId: string; customerId: string; seatLabel?: string },
  ) {
    return this.membershipService.adminAddSeat(user.orgId, {
      groupId: body.groupId,
      customerId: body.customerId,
      seatLabel: body.seatLabel,
      approvedById: user.id,
    });
  }

  @Patch(':id/label')
  @ApiOperation({ summary: 'Rename a seat (member or admin)' })
  async updateLabel(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { seatLabel: string },
  ) {
    if (user.type === 'customer') {
      return this.membershipService.updateSeatLabel(id, body.seatLabel, user.id);
    }
    return this.membershipService.updateSeatLabel(id, body.seatLabel, undefined, user.orgId);
  }

  @Patch(':id/approve')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Approve a membership / seat request' })
  async approve(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { ticketNumber?: number },
  ) {
    return this.membershipService.approve(id, user.orgId, user.id, body?.ticketNumber);
  }

  @Patch(':id/reject')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Reject a membership request' })
  async reject(@CurrentUser() user: any, @Param('id') id: string) {
    return this.membershipService.reject(id, user.orgId);
  }

  @Post('activate/:groupId')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Activate all approved members in a group' })
  async activateAll(@CurrentUser() user: any, @Param('groupId') groupId: string) {
    return this.membershipService.activateApproved(groupId, user.orgId);
  }

  @Patch(':id/lift')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Mark a seat as lifted for a specific month' })
  async markAsLifted(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { monthNumber?: number },
  ) {
    return this.membershipService.markAsLifted(id, user.orgId, user.id, body?.monthNumber);
  }

  @Get('my')
  @Roles('CUSTOMER')
  @ApiOperation({ summary: 'Get my seats / memberships (customer)' })
  async getMyMemberships(@CurrentUser() user: any) {
    const memberships = await this.membershipService.getMyMemberships(user.id);
    return memberships.map(({ ticketNumber: _ticketNumber, ...membership }) => membership);
  }

  @Get('my/:id')
  @Roles('CUSTOMER')
  @ApiOperation({ summary: 'Get seat detail (customer)' })
  async getMembershipDetail(@CurrentUser() user: any, @Param('id') id: string) {
    const membership = await this.membershipService.getMembershipDetail(id, user.id);
    const { ticketNumber: _ticketNumber, ...memberSafe } = membership;
    return memberSafe;
  }

  @Get('pending')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Get pending join/seat requests (admin)' })
  async getPendingRequests(@CurrentUser() user: any) {
    return this.membershipService.getPendingRequests(user.orgId);
  }
}
