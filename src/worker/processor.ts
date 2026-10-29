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
  const { jobId, originalFileName, rawFilePath, tool, toolOptions } = job.data;

  console.log(`\n========================================`);
  console.log(`[Worker] Started processing Job: ${jobId}`);
  console.log(`[Worker] Tool Mode: ${tool || 'multi-rendition'}`);
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
  const outputDir = StorageService.getJobOutputDir(jobId);
  const baseName = path.parse(originalFileName).name.replace(/[^a-zA-Z0-9_-]/g, '_');

  // ==============================================================
  // CONSUMER USER TOOL PIPELINES (Compress, MP3, Trim, Mute, Speed, GIF, Convert)
  // ==============================================================
  if (tool && tool !== ('transcode' as any)) {
    let finalFileName = `${baseName}_processed.mp4`;
    let contentType = 'video/mp4';
    let outputFormat = 'mp4';

    await job.updateProgress({
      stage: 'transcode',
      percent: 15,
      message: `Applying ${tool.toUpperCase()} transformation...`,
    } as JobProgressUpdate);

    if (tool === 'extract-audio') {
      finalFileName = `${baseName}.mp3`;
      contentType = 'audio/mpeg';
      outputFormat = 'mp3';
      const outFilePath = path.join(outputDir, finalFileName);

      await TranscodingEngine.extractMp3(
        rawFilePath,
        outFilePath,
        toolOptions?.audioBitrate || '192k',
        (pct) => {
          job.updateProgress({
            stage: 'transcode',
            percent: Math.round(15 + pct * 0.75),
            message: `Extracting high-fidelity MP3 audio (${pct}%)...`,
          } as JobProgressUpdate);
        }
      );
    } else if (tool === 'compress') {
      finalFileName = `${baseName}_compressed.mp4`;
      contentType = 'video/mp4';
      outputFormat = 'mp4';
      const outFilePath = path.join(outputDir, finalFileName);

      const rawMB = metadata.sizeBytes / (1024 * 1024);
      let targetMB = 15; // default WhatsApp safe
      if (toolOptions?.compressPreset === 'whatsapp-16') targetMB = 14;
      else if (toolOptions?.compressPreset === 'whatsapp-64') targetMB = 58;
      else if (toolOptions?.compressPreset === 'email-25' || toolOptions?.compressPreset === 'discord-25') targetMB = 22;
      else if (toolOptions?.compressPreset === 'half') targetMB = Math.max(1, Math.round(rawMB * 0.5));
      else if (toolOptions?.compressPreset === 'quarter') targetMB = Math.max(1, Math.round(rawMB * 0.25));
      else if (toolOptions?.targetSizeMB) targetMB = toolOptions.targetSizeMB;

      await TranscodingEngine.compressToTargetSize(
        rawFilePath,
        outFilePath,
        targetMB,
        metadata.duration,
        (pct) => {
          job.updateProgress({
            stage: 'transcode',
            percent: Math.round(15 + pct * 0.75),
            message: `Optimizing and compressing video (${pct}%)...`,
          } as JobProgressUpdate);
        }
      );
    } else if (tool === 'trim') {
      finalFileName = `${baseName}_trimmed.mp4`;
      contentType = 'video/mp4';
      outputFormat = 'mp4';
      const outFilePath = path.join(outputDir, finalFileName);
      const start = Math.max(0, toolOptions?.startTimeSec || 0);
      const end = toolOptions?.endTimeSec && toolOptions.endTimeSec > start 
        ? toolOptions.endTimeSec 
        : metadata.duration;

      await TranscodingEngine.trimVideo(
        rawFilePath,
        outFilePath,
        start,
        end,
        (pct) => {
          job.updateProgress({
            stage: 'transcode',
            percent: Math.round(15 + pct * 0.75),
            message: `Trimming clip from ${start.toFixed(1)}s to ${end.toFixed(1)}s (${pct}%)...`,
          } as JobProgressUpdate);
        }
      );
    } else if (tool === 'mute') {
      finalFileName = `${baseName}_muted.mp4`;
      contentType = 'video/mp4';
      outputFormat = 'mp4';
      const outFilePath = path.join(outputDir, finalFileName);

      await TranscodingEngine.muteVideo(
        rawFilePath,
        outFilePath,
        (pct) => {
          job.updateProgress({
            stage: 'transcode',
            percent: Math.round(15 + pct * 0.75),
            message: `Removing audio track and background noise (${pct}%)...`,
          } as JobProgressUpdate);
        }
      );
    } else if (tool === 'speed') {
      const speed = toolOptions?.speedMultiplier || 1.5;
      finalFileName = `${baseName}_${speed}x.mp4`;
      contentType = 'video/mp4';
      outputFormat = 'mp4';
      const outFilePath = path.join(outputDir, finalFileName);

      await TranscodingEngine.changeSpeed(
        rawFilePath,
        outFilePath,
        speed,
        (pct) => {
          job.updateProgress({
            stage: 'transcode',
            percent: Math.round(15 + pct * 0.75),
            message: `Adjusting playback speed to ${speed}x (${pct}%)...`,
          } as JobProgressUpdate);
        }
      );
    } else if (tool === 'gif') {
      finalFileName = `${baseName}.gif`;
      contentType = 'image/gif';
      outputFormat = 'gif';
      const outFilePath = path.join(outputDir, finalFileName);
      const start = Math.max(0, toolOptions?.startTimeSec || 0);
      const dur = Math.min(8, Math.max(1, (toolOptions?.endTimeSec || 3.5) - start));

      await TranscodingEngine.generatePreviewGif(rawFilePath, outFilePath, start, dur);
    } else if (tool === 'convert') {
      const targetExt = toolOptions?.targetFormat || 'mp4';
      finalFileName = `${baseName}_converted.${targetExt}`;
      contentType = targetExt === 'webm' ? 'video/webm' : 'video/mp4';
      outputFormat = targetExt;
      const outFilePath = path.join(outputDir, finalFileName);

      await TranscodingEngine.convertFormat(
        rawFilePath,
        outFilePath,
        targetExt,
        (pct) => {
          job.updateProgress({
            stage: 'transcode',
            percent: Math.round(15 + pct * 0.75),
            message: `Converting to standard universal .${targetExt} (${pct}%)...`,
          } as JobProgressUpdate);
        }
      );
    }

    const outFilePath = path.join(outputDir, finalFileName);
    const fileStats = fs.existsSync(outFilePath) ? fs.statSync(outFilePath) : { size: 0 };
    let publicUrl = StorageService.getPublicMediaUrl(jobId, finalFileName);

    // Upload to S3 if configured
    if (CONFIG.STORAGE_DRIVER === 's3' && CONFIG.AWS_S3_BUCKET && fs.existsSync(outFilePath)) {
      const s3Key = `processed/${jobId}/${finalFileName}`;
      publicUrl = await StorageService.uploadToS3(s3Key, outFilePath, contentType);
    }

    // Capture single snapshot thumbnail for video outputs
    let thumbnailUrls: string[] = [];
    if (outputFormat !== 'mp3' && outputFormat !== 'gif') {
      try {
        const thumbNames = await TranscodingEngine.generateThumbnails(rawFilePath, outputDir, ['0.5']);
        for (const tName of thumbNames) {
          const tPath = path.join(outputDir, tName);
          let tUrl = StorageService.getPublicMediaUrl(jobId, tName);
          if (CONFIG.STORAGE_DRIVER === 's3' && CONFIG.AWS_S3_BUCKET && fs.existsSync(tPath)) {
            tUrl = await StorageService.uploadToS3(`processed/${jobId}/${tName}`, tPath, 'image/jpeg');
          }
          thumbnailUrls.push(tUrl);
        }
      } catch {}
    }

    // Step Finalize
    await job.updateProgress({
      stage: 'completed',
      percent: 100,
      message: 'Processing complete! Your file is ready to download.',
    } as JobProgressUpdate);

    // Auto-clean raw input to save server disk
    if (CONFIG.DELETE_RAW_AFTER_TRANSCODE && fs.existsSync(rawFilePath)) {
      try {
        await fs.promises.unlink(rawFilePath);
      } catch {}
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`[Worker] Finished Consumer Tool ${tool} for Job ${jobId} in ${(processingTimeMs / 1000).toFixed(2)}s`);

    return {
      jobId,
      originalFileName,
      metadata,
      tool,
      outputFileName: finalFileName,
      outputFileUrl: publicUrl,
      outputFileSizeBytes: fileStats.size,
      outputFormat,
      thumbnails: thumbnailUrls,
      completedAt: new Date().toISOString(),
      processingTimeMs,
    };
  }

  // ==============================================================
  // FALLBACK: MULTI-RESOLUTION TRANSCODING
  // ==============================================================
  const applicablePresets = RESOLUTION_PRESETS.filter(
    (preset) => preset.height <= metadata.height || preset.resolution === '360p'
  );

  const renditions: VideoRendition[] = [];
  const totalRenditions = applicablePresets.length;
  const progressPerRendition = 75 / totalRenditions;

  for (let i = 0; i < totalRenditions; i++) {
    const preset = applicablePresets[i];
    const outFileName = `${preset.resolution}.mp4`;
    const outFilePath = path.join(outputDir, outFileName);
    const baseProgress = 10 + i * progressPerRendition;

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

  // Thumbnail Snapshots
  const thumbnailFiles = await TranscodingEngine.generateThumbnails(rawFilePath, outputDir, ['0.2', '0.5']);
  const thumbnailUrls: string[] = [];
  for (const thumbName of thumbnailFiles) {
    const thumbPath = path.join(outputDir, thumbName);
    let thumbUrl = StorageService.getPublicMediaUrl(jobId, thumbName);
    if (CONFIG.STORAGE_DRIVER === 's3' && CONFIG.AWS_S3_BUCKET && fs.existsSync(thumbPath)) {
      thumbUrl = await StorageService.uploadToS3(`processed/${jobId}/${thumbName}`, thumbPath, 'image/jpeg');
    }
    thumbnailUrls.push(thumbUrl);
  }

  // Finalize
  await job.updateProgress({
    stage: 'completed',
    percent: 100,
    message: 'Processing complete! All media assets ready.',
  } as JobProgressUpdate);

  if (CONFIG.DELETE_RAW_AFTER_TRANSCODE && fs.existsSync(rawFilePath)) {
    try {
      await fs.promises.unlink(rawFilePath);
    } catch {}
  }

  const processingTimeMs = Date.now() - startTime;
  const bestRendition = renditions[0];

  return {
    jobId,
    originalFileName,
    metadata,
    outputFileName: bestRendition?.fileName,
    outputFileUrl: bestRendition?.fileUrl,
    outputFileSizeBytes: bestRendition?.fileSizeBytes,
    outputFormat: 'mp4',
    renditions,
    thumbnails: thumbnailUrls,
    completedAt: new Date().toISOString(),
    processingTimeMs,
  };
}
