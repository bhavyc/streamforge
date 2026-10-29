import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StreamForge Studio | Free Online Video Compressor & MP3 Tools',
  description:
    'Free online video tools to compress videos for WhatsApp & Email, extract MP3 audio, trim clips, mute background noise, and convert video formats. 100% private, no watermark.',
  keywords: [
    'video compressor',
    'whatsapp video compressor',
    'video to mp3',
    'trim video online',
    'mute video',
    'change video speed',
    'video converter',
    'free online video editor',
  ],
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
