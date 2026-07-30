import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class StaffController {
  constructor(private staffService: StaffService) {}

  @Get()
  async findAll(@CurrentUser() user: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.staffService.findAll(user.orgId, page ? parseInt(page) : 1, limit ? Math.min(parseInt(limit) || 20, 100) : 20);
  }

  @Get(':id')
  async findById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.staffService.findById(user.orgId, id);
  }

  @Patch(':id/toggle')
  async toggleActive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.staffService.toggleActive(user.orgId, id);
  }
}
