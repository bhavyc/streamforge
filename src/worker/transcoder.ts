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

  /**
   * 1-Click Audio Extraction to MP3
   */
  static extractMp3(
    inputPath: string,
    outputPath: string,
    bitrate: string = '192k',
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate(bitrate)
        .output(outputPath)
        .on('progress', (p) => {
          if (p.percent && onProgress) onProgress(Math.min(100, Math.round(p.percent)));
        })
        .on('end', () => {
          if (onProgress) onProgress(100);
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Target-Size Video Compressor (WhatsApp, Email, Custom Size)
   */
  static compressToTargetSize(
    inputPath: string,
    outputPath: string,
    targetSizeMB: number,
    durationSec: number,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const dur = Math.max(1, durationSec);
      const totalBits = targetSizeMB * 8 * 1024 * 1024;
      const audioBitrateKbps = 96;
      const targetVideoBitrateKbps = Math.max(
        150,
        Math.floor((totalBits / dur / 1000) - audioBitrateKbps)
      );

      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset veryfast',
          `-b:v ${targetVideoBitrateKbps}k`,
          `-maxrate ${Math.round(targetVideoBitrateKbps * 1.2)}k`,
          `-bufsize ${targetVideoBitrateKbps * 2}k`,
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          "-vf scale='min(1280,iw)':-2",
        ])
        .audioBitrate('96k')
        .output(outputPath)
        .on('progress', (p) => {
          if (p.percent && onProgress) onProgress(Math.min(100, Math.round(p.percent)));
        })
        .on('end', () => {
          if (onProgress) onProgress(100);
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Fast Video Trimmer / Cutter
   */
  static trimVideo(
    inputPath: string,
    outputPath: string,
    startSec: number,
    endSec: number,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const duration = Math.max(0.5, endSec - startSec);
      ffmpeg(inputPath)
        .setStartTime(Math.max(0, startSec))
        .setDuration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-preset veryfast', '-movflags +faststart'])
        .output(outputPath)
        .on('progress', (p) => {
          if (p.percent && onProgress) onProgress(Math.min(100, Math.round(p.percent)));
        })
        .on('end', () => {
          if (onProgress) onProgress(100);
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Remove Audio / Mute Video
   */
  static muteVideo(
    inputPath: string,
    outputPath: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noAudio()
        .outputOptions(['-c:v copy'])
        .output(outputPath)
        .on('end', () => {
          if (onProgress) onProgress(100);
          resolve();
        })
        .on('error', () => {
          // Fallback to re-encode if stream copy fails on certain containers
          ffmpeg(inputPath)
            .noAudio()
            .videoCodec('libx264')
            .outputOptions(['-preset ultrafast', '-movflags +faststart'])
            .output(outputPath)
            .on('end', () => {
              if (onProgress) onProgress(100);
              resolve();
            })
            .on('error', (reErr) => reject(reErr))
            .run();
        })
        .run();
    });
  }

  /**
   * Change Video Speed (0.5x, 0.75x, 1.25x, 1.5x, 2x)
   */
  static changeSpeed(
    inputPath: string,
    outputPath: string,
    speedMultiplier: number,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const speed = Math.max(0.25, Math.min(4, speedMultiplier));
      const videoFilter = `setpts=${(1 / speed).toFixed(4)}*PTS`;
      const audioFilter = `atempo=${speed.toFixed(2)}`;

      ffmpeg(inputPath)
        .videoFilters(videoFilter)
        .audioFilters(audioFilter)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-preset veryfast', '-movflags +faststart'])
        .output(outputPath)
        .on('progress', (p) => {
          if (p.percent && onProgress) onProgress(Math.min(100, Math.round(p.percent)));
        })
        .on('end', () => {
          if (onProgress) onProgress(100);
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Convert Video Format (MOV/MKV/AVI -> MP4/WebM)
   */
  static convertFormat(
    inputPath: string,
    outputPath: string,
    format: string = 'mp4',
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = ffmpeg(inputPath);
      if (format === 'webm') {
        cmd.videoCodec('libvpx-vp9').audioCodec('libopus');
      } else {
        cmd
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions(['-preset veryfast', '-movflags +faststart', '-pix_fmt yuv420p']);
      }

      cmd
        .output(outputPath)
        .on('progress', (p) => {
          if (p.percent && onProgress) onProgress(Math.min(100, Math.round(p.percent)));
        })
        .on('end', () => {
          if (onProgress) onProgress(100);
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }
}
