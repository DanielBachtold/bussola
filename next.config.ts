import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // extrato de um ano em OFX ou fatura em PDF passam fácil do 1 MB padrão
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
