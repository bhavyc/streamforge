import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { VideoMetadata } from './types';
import fs from 'fs';

// Set paths to bundled binaries (works on Windows, Linux, Mac)
if (ffmpegInstaller.path) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
}
if (ffprobeInstaller.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
}

export { ffmpeg };

/**
 * Extracts comprehensive media metadata using ffprobe
 */
export function probeVideo(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(err);
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

      let fps = 30;
      if (videoStream?.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/');
        if (parts.length === 2 && parseFloat(parts[1]) > 0) {
          fps = Math.round(parseFloat(parts[0]) / parseFloat(parts[1]));
        } else {
          fps = Math.round(parseFloat(videoStream.r_frame_rate)) || 30;
        }
      }

      const stats = fs.statSync(filePath);

      const result: VideoMetadata = {
        duration: metadata.format.duration || 0,
        width: videoStream?.width || 1280,
        height: videoStream?.height || 720,
        format: metadata.format.format_name || 'mp4',
        bitrate: metadata.format.bit_rate ? Math.round(metadata.format.bit_rate / 1000) : 0,
        fps,
        videoCodec: videoStream?.codec_name || 'unknown',
        audioCodec: audioStream?.codec_name || 'none',
        sizeBytes: stats.size,
      };

      resolve(result);
    });
  });
}
