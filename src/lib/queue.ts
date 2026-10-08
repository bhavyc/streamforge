import { Queue } from 'bullmq';
import { redisConnectionOptions } from './redis';
import { CONFIG } from '../config/env';
import { VideoProcessingJobData, VideoProcessingResult } from './types';
import {
  checkRedisBullMQCompatibility,
  getEmbeddedQueue,
  UnifiedJob,
  queueEvents,
} from './queue-manager';

// Global cache for BullMQ Queue
declare global {
  // eslint-disable-next-line no-var
  var __videoQueue: Queue<VideoProcessingJobData> | undefined;
  // eslint-disable-next-line no-var
  var __bullMQAvailable: boolean | undefined;
}

export { queueEvents };

export async function isBullMQ(): Promise<boolean> {
  if (global.__bullMQAvailable !== undefined) {
    return global.__bullMQAvailable;
  }
  global.__bullMQAvailable = await checkRedisBullMQCompatibility();
  return global.__bullMQAvailable;
}

export function getBullQueue(): Queue<VideoProcessingJobData> {
  if (!global.__videoQueue) {
    global.__videoQueue = new Queue<VideoProcessingJobData>(CONFIG.QUEUE_NAME, {
      connection: redisConnectionOptions,
    });
  }
  return global.__videoQueue;
}

export async function addVideoJob(jobData: VideoProcessingJobData): Promise<UnifiedJob | any> {
  const bullAvailable = await isBullMQ();
  if (bullAvailable) {
    try {
      const queue = getBullQueue();
      return await queue.add('transcode-video', jobData, {
        jobId: jobData.jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
      });
    } catch (err) {
      console.warn('[BullMQ Add Fallback]:', err);
    }
  }

  // Resilient Embedded Engine
  const embedded = getEmbeddedQueue();
  return await embedded.addJob(jobData);
}

export async function getVideoJob(id: string): Promise<UnifiedJob | any | null> {
  const bullAvailable = await isBullMQ();
  if (bullAvailable) {
    try {
      const queue = getBullQueue();
      const job = await queue.getJob(id);
      if (job) return job;
    } catch {
      // fallback
    }
  }

  const embedded = getEmbeddedQueue();
  return await embedded.getJob(id);
}

export async function getJobs(statuses: ('waiting' | 'active' | 'completed' | 'failed')[]): Promise<any[]> {
  const bullAvailable = await isBullMQ();
  if (bullAvailable) {
    try {
      const queue = getBullQueue();
      return await queue.getJobs(statuses, 0, 20);
    } catch {
      // fallback
    }
  }

  const embedded = getEmbeddedQueue();
  return await embedded.getJobs(statuses);
}

export async function getQueueMetrics() {
  const bullAvailable = await isBullMQ();
  if (bullAvailable) {
    try {
      const queue = getBullQueue();
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
        engine: 'BullMQ (Redis Distributed)',
      };
    } catch {
      // fallback
    }
  }

  const embedded = getEmbeddedQueue();
  const metrics = await embedded.getMetrics();
  return {
    ...metrics,
    delayed: 0,
    engine: 'High-Performance Local Async Queue',
  };
}
