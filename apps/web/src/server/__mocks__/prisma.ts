import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

export const prisma = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(prisma);
});

vi.mock('../prisma', () => ({
  prisma,
}));
