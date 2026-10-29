/** @type {import('next').NextConfig} */
const nextConfig = {
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
