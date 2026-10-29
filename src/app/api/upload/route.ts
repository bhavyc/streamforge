import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { StorageService } from '@/lib/storage';
import { addVideoJob } from '@/lib/queue';
import { CONFIG } from '@/config/env';
import { VideoProcessingJobData } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No video file provided in form-data (field "video" required).' },
        { status: 400 }
      );
    }

    const originalFileName = file.name || 'uploaded_video.mp4';
    const extension = path.extname(originalFileName).toLowerCase() || '.mp4';

    // Validate allowed file extensions
    if (!CONFIG.ALLOWED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        {
          error: `Unsupported file format "${extension}". Allowed formats: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}`,
        },
        { status: 415 }
      );
    }

    // Validate maximum file size limit
    const maxSizeBytes = CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return NextResponse.json(
        {
          error: `File size exceeds the limit of ${CONFIG.MAX_FILE_SIZE_MB}MB. Uploaded: ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
        },
        { status: 413 }
      );
    }

    const jobId = uuidv4();
    const safeFileName = `${jobId}${extension}`;

    // Stream directly to disk (Zero-RAM buffering)
    const rawFilePath = await StorageService.saveRawFileStream(safeFileName, file.stream());

    const tool = (formData.get('tool') as any) || 'compress';
    let toolOptions = undefined;
    const rawOptions = formData.get('toolOptions') as string | null;
    if (rawOptions) {
      try {
        toolOptions = JSON.parse(rawOptions);
      } catch {}
    }

    // Build job payload
    const jobData: VideoProcessingJobData = {
      jobId,
      originalFileName,
      rawFilePath,
      uploadedAt: new Date().toISOString(),
      tool,
      toolOptions,
    };

    // Dispatch job to BullMQ Redis Queue
    await addVideoJob(jobData);

    return NextResponse.json(
      {
        success: true,
        jobId,
        fileName: originalFileName,
        fileSizeBytes: file.size,
        status: 'queued',
        message: 'Video successfully uploaded and enqueued for asynchronous processing.',
      },
      { status: 202 }
    );
  } catch (error: any) {
    console.error('[API Upload Error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process video upload.' },
      { status: 500 }
    );
  }
}
