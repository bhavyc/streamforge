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

export interface VideoProcessingJobData {
  jobId: string;
  originalFileName: string;
  rawFilePath: string;
  uploadedAt: string;
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
  renditions: VideoRendition[];
  thumbnails: string[];
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
