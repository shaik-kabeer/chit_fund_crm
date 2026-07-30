/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@chitfund/shared', '@chitfund/database'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
};

module.exports = nextConfig;
