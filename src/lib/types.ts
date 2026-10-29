export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  format: string;
  bitrate: number;
  fps: number;
  audioCodec?: string;
  videoCodec?: string;
  sizeBytes: number;
}

export interface VideoRendition {
  resolution: '1080p' | '720p' | '480p' | '360p';
  width: number;
  height: number;
  bitrate: string;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number;
  duration: number;
}

export type VideoToolType = 
  | 'compress' 
  | 'extract-audio' 
  | 'trim' 
  | 'mute' 
  | 'speed' 
  | 'gif' 
  | 'convert';

export interface VideoToolOptions {
  compressPreset?: 'whatsapp-16' | 'whatsapp-64' | 'email-25' | 'discord-25' | 'half' | 'quarter';
  targetSizeMB?: number;
  startTimeSec?: number;
  endTimeSec?: number;
  speedMultiplier?: number;
  targetFormat?: 'mp4' | 'webm' | 'gif' | 'mp3';
  audioBitrate?: '128k' | '192k' | '320k';
}

export interface VideoProcessingJobData {
  jobId: string;
  originalFileName: string;
  rawFilePath: string;
  uploadedAt: string;
  tool?: VideoToolType;
  toolOptions?: VideoToolOptions;
  s3Key?: string;
}

export interface JobProgressUpdate {
  stage: 'probe' | 'transcode' | 'thumbnails' | 'finalizing' | 'completed';
  percent: number;
  currentResolution?: string;
  message: string;
}

export interface VideoProcessingResult {
  jobId: string;
  originalFileName: string;
  metadata: VideoMetadata;
  tool?: VideoToolType;
  outputFileName?: string;
  outputFileUrl?: string;
  outputFileSizeBytes?: number;
  outputFormat?: string;
  renditions?: VideoRendition[];
  thumbnails?: string[];
  previewGif?: string;
  completedAt: string;
  processingTimeMs: number;
}

export interface JobDetailsResponse {
  id: string;
  status: JobStatus;
  progress: number;
  progressMessage?: string;
  currentStage?: string;
  failedReason?: string;
  data: VideoProcessingJobData;
  returnvalue?: VideoProcessingResult;
  result?: VideoProcessingResult;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}
