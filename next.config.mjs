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
    // Allows larger file payloads if needed
  }
};

export default nextConfig;
