import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { StorageService } from '@/lib/storage';
import { addVideoJob } from '@/lib/queue';
import { VideoProcessingJobData } from '@/lib/types';

export async function POST() {
  try {
    const samplePath = path.join(process.cwd(), 'samples', 'test-sample.mp4');

    if (!fs.existsSync(samplePath)) {
      return NextResponse.json(
        { error: 'Sample video not found. Run "node scripts/generate-sample-video.js".' },
        { status: 404 }
      );
    }

    const sampleBuffer = fs.readFileSync(samplePath);
    const jobId = uuidv4();
    const rawFileName = `${jobId}_sample.mp4`;

    const rawFilePath = await StorageService.saveRawFile(rawFileName, sampleBuffer);

    const jobData: VideoProcessingJobData = {
      jobId,
      originalFileName: 'test-sample.mp4',
      rawFilePath,
      uploadedAt: new Date().toISOString(),
    };

    await addVideoJob(jobData);

    return NextResponse.json({
      success: true,
      jobId,
      fileName: 'test-sample.mp4',
      fileSizeBytes: sampleBuffer.byteLength,
      status: 'queued',
      message: 'Sample video loaded and enqueued for transcoding.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
