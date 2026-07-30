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
import { ProductService } from './product.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductController {
  constructor(private productService: ProductService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Create a product (scheme template)' })
  async create(@CurrentUser() user: any, @Body() body: any) {
    return this.productService.create(user.orgId, {
      ...body,
      createdBy: user.id,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all products' })
  async findAll(
    @CurrentUser() user: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.productService.findAll(user.orgId, includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product details' })
  async findById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productService.findById(user.orgId, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Update product' })
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.productService.update(user.orgId, id, body);
  }

  @Patch(':id/toggle')
  @Roles('SUPER_ADMIN', 'BRANCH_ADMIN')
  @ApiOperation({ summary: 'Toggle product active status' })
  async toggle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productService.toggleActive(user.orgId, id);
  }
}
