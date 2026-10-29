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
  }
};

export default nextConfig;
