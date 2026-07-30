import { prisma } from '@chitfund/database';

export { prisma };

// BigInt JSON for API responses
(BigInt.prototype as unknown as { toJSON?: () => number }).toJSON = function () {
  return Number(this);
};
