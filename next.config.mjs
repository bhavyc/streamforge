/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  serverExternalPackages: [
    'bullmq',
    'ioredis',
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
    '@ffprobe-installer/ffprobe'
  ],
  experimental: {
    agentUpgrade: 'security',
  },
  async rewrites() {
    return [
      {
        source: '/api/.health',
        destination: '/api/health',
      },
      {
        source: '/healthz',
        destination: '/api/health',
      },
    ];
  },
};

export default nextConfig;
