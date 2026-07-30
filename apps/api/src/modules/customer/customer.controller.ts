import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerController {
  constructor(private customerService: CustomerService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  async create(
    @CurrentUser() user: any,
    @Body() body: { name: string; phone: string; email?: string; password?: string; branchId?: string },
  ) {
    return this.customerService.createByAdmin(user.orgId, user.id, body);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR')
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.customerService.findAll(user.orgId, page ? parseInt(page) : 1, limit ? Math.min(parseInt(limit) || 20, 100) : 20, search);
  }

  @Get('profile')
  @Roles('CUSTOMER')
  async getProfile(@CurrentUser() user: any) {
    return this.customerService.getProfile(user.id);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR')
  async findById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customerService.findById(user.orgId, id);
  }

  @Patch('profile')
  @Roles('CUSTOMER')
  async updateProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.customerService.updateProfile(user.id, body);
  }

  @Patch('bank-details')
  @Roles('CUSTOMER')
  async updateBankDetails(@CurrentUser() user: any, @Body() body: any) {
    return this.customerService.updateBankDetails(user.id, body);
  }

  @Post('kyc/submit')
  @Roles('CUSTOMER')
  async submitKyc(@CurrentUser() user: any, @Body() body: any) {
    return this.customerService.submitKyc(user.id, body);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  async updateCustomer(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.customerService.updateByAdmin(user.orgId, id, body);
  }

  @Patch(':id/kyc')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  async updateKyc(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { status: string; reason?: string },
  ) {
    return this.customerService.updateKycStatus(
      user.orgId,
      id,
      body.status,
      user.id,
      body.reason,
    );
  }
}
