import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { StaffModule } from './modules/staff/staff.module';
import { CustomerModule } from './modules/customer/customer.module';
import { ProductModule } from './modules/product/product.module';
import { ChitGroupModule } from './modules/chit-group/chit-group.module';
import { MembershipModule } from './modules/membership/membership.module';
import { InstallmentModule } from './modules/installment/installment.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AuctionModule } from './modules/auction/auction.module';
import { AuditModule } from './modules/audit/audit.module';
import { UploadModule } from './modules/upload/upload.module';

@Module({
  imports: [
    // Production (Vercel / Railway / etc.) must inject env vars from the host.
    // Local .env files are only loaded in non-production so secrets stay out of git.
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    StaffModule,
    CustomerModule,
    ProductModule,
    ChitGroupModule,
    MembershipModule,
    InstallmentModule,
    PaymentModule,
    AuctionModule,
    AuditModule,
    UploadModule,
  ],
})
export class AppModule {}
