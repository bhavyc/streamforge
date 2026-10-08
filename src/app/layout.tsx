import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StreamForge | Distributed Video Transcoding & Media Pipeline',
  description:
    'Production-grade asynchronous distributed video transcoding pipeline built with Next.js, BullMQ, Redis, FFmpeg, and S3-compatible cloud storage.',
  keywords: [
    'video transcoding',
    'ffmpeg',
    'bullmq',
    'redis message queue',
    'asynchronous processing',
    'distributed systems',
    'nextjs',
    'hls streaming',
  ],
  authors: [{ name: 'Cloud & Backend Media Systems' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
