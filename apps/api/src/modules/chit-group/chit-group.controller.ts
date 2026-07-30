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
import { ChitGroupService } from './chit-group.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Chit Groups')
@ApiBearerAuth()
@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChitGroupController {
  constructor(private groupService: ChitGroupService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Create a new chit group' })
  async create(@CurrentUser() user: any, @Body() body: any) {
    return this.groupService.create(user.orgId, {
      ...body,
      createdBy: user.id,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all groups' })
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.groupService.findAll(user.orgId, { status, branchId });
  }

  @Get('available')
  @ApiOperation({ summary: 'List open groups for customers (no seat counts)' })
  async getAvailable(@CurrentUser() user: any) {
    return this.groupService.getAvailable(user.orgId);
  }

  @Get('stats')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Get dashboard-level statistics' })
  async getDashboardStats(@CurrentUser() user: any) {
    return this.groupService.getDashboardStats(user.orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get group detail with members' })
  async findById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.groupService.findById(user.orgId, id);
  }

  @Get(':id/months')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Month-by-month payment and lift status for a group' })
  async getMonthOverview(@CurrentUser() user: any, @Param('id') id: string) {
    return this.groupService.getMonthOverview(user.orgId, id);
  }

  @Get(':id/stats')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Get group financial stats' })
  async getStats(@CurrentUser() user: any, @Param('id') id: string) {
    return this.groupService.getStats(user.orgId, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Edit group details' })
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { groupNumber?: string; agreementNo?: string; startDate?: string; branchId?: string | null },
  ) {
    return this.groupService.update(user.orgId, id, body);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Update group status' })
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.groupService.updateStatus(user.orgId, id, body.status);
  }
}
