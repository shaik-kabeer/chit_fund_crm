import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.staff.findMany({
        where: { orgId },
        select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.staff.count({ where: { orgId } }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } };
  }

  async findById(orgId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, orgId },
      select: { id: true, name: true, email: true, phone: true, role: true, branchId: true, isActive: true, lastLoginAt: true, createdAt: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return staff;
  }

  async toggleActive(orgId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id, orgId } });
    if (!staff) throw new NotFoundException('Staff not found');
    return this.prisma.staff.update({
      where: { id },
      data: { isActive: !staff.isActive, tokenVersion: { increment: 1 } },
    });
  }
}
