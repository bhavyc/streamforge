import path from 'path';
import fs from 'fs';
import { ffmpeg, probeVideo } from '../lib/ffmpeg';
import { VideoMetadata, VideoRendition, JobProgressUpdate } from '../lib/types';
import { StorageService } from '../lib/storage';

export interface ResolutionConfig {
  resolution: '1080p' | '720p' | '480p' | '360p';
  width: number;
  height: number;
  bitrate: string;
  audioBitrate: string;
}

export const RESOLUTION_PRESETS: ResolutionConfig[] = [
  { resolution: '1080p', width: 1920, height: 1080, bitrate: '4000k', audioBitrate: '192k' },
  { resolution: '720p',  width: 1280, height: 720,  bitrate: '2200k', audioBitrate: '128k' },
  { resolution: '480p',  width: 854,  height: 480,  bitrate: '1000k', audioBitrate: '96k' },
  { resolution: '360p',  width: 640,  height: 360,  bitrate: '600k',  audioBitrate: '64k' },
];

export class TranscodingEngine {
  /**
   * Transcode a single rendition with progress callback
   */
  static transcodeResolution(
    inputPath: string,
    outputPath: string,
    config: ResolutionConfig,
    duration: number,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset veryfast', // fast encoding for high throughput
          '-movflags +faststart', // enables instant streaming playback
          '-pix_fmt yuv420p', // universal browser compatibility
          `-maxrate ${config.bitrate}`,
          `-bufsize ${parseInt(config.bitrate) * 2}k`,
        ])
        .size(`${config.width}x${config.height}`)
        .audioBitrate(config.audioBitrate)
        .output(outputPath)
        .on('progress', (progress) => {
          if (progress.percent && progress.percent > 0) {
            onProgress(Math.min(100, Math.max(0, Math.round(progress.percent))));
          } else if (progress.timemark && duration > 0) {
            // Calculate percentage from timemark: "00:01:23.45"
            const parts = progress.timemark.split(':');
            if (parts.length === 3) {
              const currentSecs =
                parseFloat(parts[0]) * 3600 +
                parseFloat(parts[1]) * 60 +
                parseFloat(parts[2]);
              const calcPercent = Math.min(100, Math.round((currentSecs / duration) * 100));
              onProgress(calcPercent);
            }
          }
        })
        .on('end', () => {
          onProgress(100);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[FFmpeg Error for ${config.resolution}]:`, err.message);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Generate static thumbnails at multiple intervals
   */
  static generateThumbnails(
    inputPath: string,
    outputFolder: string,
    timestamps: string[]
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const generatedNames: string[] = [];
      timestamps.forEach((_, idx) => {
        generatedNames.push(`thumb_${idx + 1}.jpg`);
      });

      ffmpeg(inputPath)
        .screenshots({
          timestamps,
          filename: 'thumb_%i.jpg',
          folder: outputFolder,
          size: '640x360',
        })
        .on('end', () => {
          resolve(generatedNames);
        })
        .on('error', (err) => {
          console.error('[FFmpeg Screenshot Error]:', err.message);
          // If error occurs, fallback with at least one frame
          resolve([]);
        });
    });
  }

  /**
   * Generate short animated GIF preview (YouTube hover style)
   */
  static generatePreviewGif(
    inputPath: string,
    outputPath: string,
    startTimeSec: number,
    durationSec: number = 2.5
  ): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpeg(inputPath)
        .setStartTime(Math.max(0, startTimeSec))
        .setDuration(durationSec)
        .fps(10)
        .size('320x180')
        .output(outputPath)
        .on('end', () => resolve(true))
        .on('error', (err) => {
          console.warn('[FFmpeg GIF warning]:', err.message);
          resolve(false);
        })
        .run();
    });
  }
}
