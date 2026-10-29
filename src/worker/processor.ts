import { Job } from 'bullmq';
import path from 'path';
import fs from 'fs';
import {
  VideoProcessingJobData,
  VideoProcessingResult,
  VideoRendition,
  JobProgressUpdate,
} from '../lib/types';
import { probeVideo } from '../lib/ffmpeg';
import { StorageService } from '../lib/storage';
import { TranscodingEngine, RESOLUTION_PRESETS } from './transcoder';
import { CONFIG } from '../config/env';

export interface JobLike {
  data: VideoProcessingJobData;
  updateProgress: (progress: any) => Promise<any>;
}

export async function processVideoJob(
  job: JobLike
): Promise<VideoProcessingResult> {
  const startTime = Date.now();
  const { jobId, originalFileName, rawFilePath } = job.data;

  console.log(`\n========================================`);
  console.log(`[Worker] Started processing Job: ${jobId}`);
  console.log(`[Worker] Input file: ${originalFileName}`);
  console.log(`========================================\n`);

  // Step 1: Probe metadata
  await job.updateProgress({
    stage: 'probe',
    percent: 5,
    message: 'Analyzing video codecs, bitrate & dimensions...',
  } as JobProgressUpdate);

  if (!fs.existsSync(rawFilePath)) {
    throw new Error(`Raw input file not found: ${rawFilePath}`);
  }

  const metadata = await probeVideo(rawFilePath);
  console.log(`[Worker] Probed Metadata:`, {
    dimensions: `${metadata.width}x${metadata.height}`,
    duration: `${metadata.duration.toFixed(1)}s`,
    codec: metadata.videoCodec,
    fps: metadata.fps,
  });

  const outputDir = StorageService.getJobOutputDir(jobId);

  // Step 2: Determine applicable resolutions based on input video height
  // E.g., if input is 1080p, do 1080p, 720p, 480p, 360p. If input is 720p, do 720p, 480p, 360p.
  const applicablePresets = RESOLUTION_PRESETS.filter(
    (preset) => preset.height <= metadata.height || preset.resolution === '360p'
  );

  // Always ensure at least 2 resolutions for demonstration
  if (applicablePresets.length === 1 && metadata.height >= 480) {
    const higherPreset = RESOLUTION_PRESETS.find((p) => p.height > metadata.height);
    if (higherPreset) applicablePresets.unshift(higherPreset);
  }

  console.log(
    `[Worker] Target renditions to encode:`,
    applicablePresets.map((p) => p.resolution).join(', ')
  );

  // Step 3: Transcode Renditions
  const renditions: VideoRendition[] = [];
  const totalRenditions = applicablePresets.length;

  // Allocated progress percentage for transcoding: 10% to 85%
  const transcodeProgressRange = 75; // 85 - 10
  const progressPerRendition = transcodeProgressRange / totalRenditions;

  for (let i = 0; i < totalRenditions; i++) {
    const preset = applicablePresets[i];
    const outFileName = `${preset.resolution}.mp4`;
    const outFilePath = path.join(outputDir, outFileName);

    const baseProgress = 10 + i * progressPerRendition;

    console.log(`[Worker] Encoding rendition ${i + 1}/${totalRenditions}: ${preset.resolution}...`);

    await TranscodingEngine.transcodeResolution(
      rawFilePath,
      outFilePath,
      preset,
      metadata.duration,
      (percent) => {
        const overall = Math.round(baseProgress + (percent / 100) * progressPerRendition);
        job.updateProgress({
          stage: 'transcode',
          percent: overall,
          currentResolution: preset.resolution,
          message: `Encoding ${preset.resolution} (${percent}%)...`,
        } as JobProgressUpdate);
      }
    );

    const fileStats = fs.statSync(outFilePath);
    let publicUrl = StorageService.getPublicMediaUrl(jobId, outFileName);

    // If S3 driver is configured, upload rendition to S3
    if (CONFIG.STORAGE_DRIVER === 's3' && CONFIG.AWS_S3_BUCKET) {
      const s3Key = `processed/${jobId}/${outFileName}`;
      publicUrl = await StorageService.uploadToS3(s3Key, outFilePath, 'video/mp4');
    }

    renditions.push({
      resolution: preset.resolution,
      width: preset.width,
      height: preset.height,
      bitrate: preset.bitrate,
      fileName: outFileName,
      fileUrl: publicUrl,
      fileSizeBytes: fileStats.size,
      duration: metadata.duration,
    });
  }

  // Step 4: Generate Thumbnails
  await job.updateProgress({
    stage: 'thumbnails',
    percent: 88,
    message: 'Capturing video snapshot thumbnails...',
  } as JobProgressUpdate);

  const duration = metadata.duration || 10;
  const samplePoints = [0.15, 0.35, 0.60, 0.85].map((ratio) =>
    (duration * ratio).toFixed(2)
  );

  const thumbnailFiles = await TranscodingEngine.generateThumbnails(
    rawFilePath,
    outputDir,
    samplePoints
  );

  const thumbnailUrls: string[] = [];
  for (const thumbName of thumbnailFiles) {
    const thumbPath = path.join(outputDir, thumbName);
    let thumbUrl = StorageService.getPublicMediaUrl(jobId, thumbName);

    if (CONFIG.STORAGE_DRIVER === 's3' && CONFIG.AWS_S3_BUCKET && fs.existsSync(thumbPath)) {
      const s3Key = `processed/${jobId}/${thumbName}`;
      thumbUrl = await StorageService.uploadToS3(s3Key, thumbPath, 'image/jpeg');
    }
    thumbnailUrls.push(thumbUrl);
  }

  // Step 5: Animated Preview GIF
  await job.updateProgress({
    stage: 'thumbnails',
    percent: 94,
    message: 'Generating animated hover preview...',
  } as JobProgressUpdate);

  const gifFileName = 'preview.gif';
  const gifFilePath = path.join(outputDir, gifFileName);
  const gifSuccess = await TranscodingEngine.generatePreviewGif(
    rawFilePath,
    gifFilePath,
    duration * 0.2, // start at 20% into video
    2.5 // 2.5 seconds clip
  );

  let previewGifUrl: string | undefined = undefined;
  if (gifSuccess && fs.existsSync(gifFilePath)) {
    previewGifUrl = StorageService.getPublicMediaUrl(jobId, gifFileName);
    if (CONFIG.STORAGE_DRIVER === 's3' && CONFIG.AWS_S3_BUCKET) {
      const s3Key = `processed/${jobId}/${gifFileName}`;
      previewGifUrl = await StorageService.uploadToS3(s3Key, gifFilePath, 'image/gif');
    }
  }

  // Step 6: Finalize Job
  await job.updateProgress({
    stage: 'completed',
    percent: 100,
    message: 'Processing complete! All media assets ready.',
  } as JobProgressUpdate);

  const processingTimeMs = Date.now() - startTime;

  // Step 7: Disk Retention & Cleanup (Production Guard)
  if (CONFIG.DELETE_RAW_AFTER_TRANSCODE && fs.existsSync(rawFilePath)) {
    try {
      await fs.promises.unlink(rawFilePath);
      console.log(`[Worker Cleanup] Purged raw input file to reclaim disk space: ${rawFilePath}`);
    } catch (cleanupErr: any) {
      console.warn(`[Worker Cleanup Warning]: Could not delete raw file: ${cleanupErr.message}`);
    }
  }

  console.log(`[Worker] Finished Job ${jobId} in ${(processingTimeMs / 1000).toFixed(2)}s`);

  return {
    jobId,
    originalFileName,
    metadata,
    renditions,
    thumbnails: thumbnailUrls,
    previewGif: previewGifUrl,
    completedAt: new Date().toISOString(),
    processingTimeMs,
  };
}
