import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { StaffLoginDto, CustomerLoginDto, CustomerRegisterDto } from './dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly cookieOptions: any;

  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      secure: config.get('NODE_ENV') === 'production',
      sameSite: 'strict' as const,
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }

  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff login' })
  async staffLogin(@Body() dto: StaffLoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.staffLogin(dto.phone, dto.password);
    res.cookie('refreshToken', tokens.refreshToken, this.cookieOptions);
    return { user, accessToken: tokens.accessToken };
  }

  @Post('customer/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer login' })
  async customerLogin(@Body() dto: CustomerLoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.customerLogin(dto.phone, dto.password);
    res.cookie('refreshToken', tokens.refreshToken, this.cookieOptions);
    return { user, accessToken: tokens.accessToken };
  }

  @Post('customer/register')
  @ApiOperation({ summary: 'Customer self-registration' })
  async customerRegister(@Body() dto: CustomerRegisterDto, @Res({ passthrough: true }) res: Response) {
    const orgId = await this.authService.resolveRegistrationOrgId(
      this.config.get<string>('DEFAULT_ORG_ID'),
    );
    const { user, tokens } = await this.authService.customerRegister({
      ...dto,
      orgId,
    });
    res.cookie('refreshToken', tokens.refreshToken, this.cookieOptions);
    return { user, accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refreshTokens(user);
    res.cookie('refreshToken', tokens.refreshToken, this.cookieOptions);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (clear refresh cookie)' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: any) {
    return user;
  }
}
