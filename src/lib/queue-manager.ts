import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';
import { Queue, Worker, Job } from 'bullmq';
import { getRedisClient, redisConnectionOptions } from './redis';
import { CONFIG } from '../config/env';
import {
  VideoProcessingJobData,
  VideoProcessingResult,
  JobStatus,
  JobProgressUpdate,
} from './types';

export interface UnifiedJob {
  id: string;
  data: VideoProcessingJobData;
  progress: any;
  status: JobStatus;
  failedReason?: string;
  returnvalue?: VideoProcessingResult;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  getState(): Promise<JobStatus>;
  updateProgress(progress: JobProgressUpdate | number): Promise<void>;
}

class QueueEventEmitter extends EventEmitter {}
export const queueEvents = new QueueEventEmitter();

/**
 * Check if connected Redis server supports BullMQ (version >= 5.0.0)
 */
export async function checkRedisBullMQCompatibility(): Promise<boolean> {
  // If in production and REDIS_HOST is either empty or points to localhost/127.0.0.1, fallback immediately
  if (process.env.NODE_ENV === 'production' && (!CONFIG.REDIS_HOST || CONFIG.REDIS_HOST === '127.0.0.1' || CONFIG.REDIS_HOST === 'localhost')) {
    return false;
  }

  try {
    const redis = getRedisClient();
    const info = await Promise.race([
      redis.info('server'),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    const match = info.match(/redis_version:([0-9.]+)/);
    if (match && match[1]) {
      const major = parseInt(match[1].split('.')[0], 10);
      if (major >= 5) {
        return true;
      }
      return false;
    }
  } catch {
    // Redis unavailable or check failed
  }
  return false;
}

// ==========================================
// Embedded Engine (File-backed & In-Memory)
// ==========================================
class EmbeddedQueueEngine {
  private jobs: Map<string, UnifiedJob> = new Map();
  private waitingIds: string[] = [];
  private activeIds: Set<string> = new Set();
  private stateFilePath: string;
  private processor?: (job: UnifiedJob) => Promise<VideoProcessingResult>;
  private concurrency = 2;

  constructor() {
    this.stateFilePath = path.join(CONFIG.STORAGE_DIR, 'queue-state.json');
    console.log('[Queue Init] stateFilePath:', this.stateFilePath, 'exists:', fs.existsSync(this.stateFilePath));
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf8');
        const data = JSON.parse(raw);
        console.log(`[Queue loadState] raw data length: ${data.length}`);
        for (const item of data) {
          let job = this.jobs.get(item.id);
          if (!job) {
            job = this.createUnifiedJobObject(item);
            this.jobs.set(job.id, job);
          } else {
            if (!this.activeIds.has(item.id)) {
              job.status = item.status;
              job.progress = item.progress;
              job.returnvalue = item.returnvalue;
              job.failedReason = item.failedReason;
              job.processedOn = item.processedOn;
              job.finishedOn = item.finishedOn;
            }
          }

          if (
            job.status === 'waiting' &&
            !this.waitingIds.includes(job.id) &&
            !this.activeIds.has(job.id)
          ) {
            this.waitingIds.push(job.id);
          }
        }
        if (this.waitingIds.length > 0) {
          console.log(`[Queue loadState] ${this.waitingIds.length} waiting jobs detected.`);
        }
      }
    } catch (err: any) {
      console.error('[loadState Exception]:', err.message);
    }
  }

  saveState() {
    try {
      if (!fs.existsSync(CONFIG.STORAGE_DIR)) {
        fs.mkdirSync(CONFIG.STORAGE_DIR, { recursive: true });
      }

      // Read current disk items first so we don't clobber items added by another process
      let diskItems: any[] = [];
      if (fs.existsSync(this.stateFilePath)) {
        try {
          diskItems = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf8'));
        } catch {}
      }

      const map = new Map<string, any>();
      for (const item of diskItems) {
        map.set(item.id, item);
      }

      for (const j of this.jobs.values()) {
        map.set(j.id, {
          id: j.id,
          data: j.data,
          progress: j.progress,
          status: j.status,
          failedReason: j.failedReason,
          returnvalue: j.returnvalue,
          timestamp: j.timestamp,
          processedOn: j.processedOn,
          finishedOn: j.finishedOn,
        });
      }

      fs.writeFileSync(
        this.stateFilePath,
        JSON.stringify(Array.from(map.values()), null, 2),
        'utf8'
      );
    } catch {
      // ignore
    }
  }

  private createUnifiedJobObject(item: any): UnifiedJob {
    const self = this;
    return {
      id: item.id,
      data: item.data,
      progress: item.progress || 0,
      status: item.status || 'waiting',
      failedReason: item.failedReason,
      returnvalue: item.returnvalue,
      timestamp: item.timestamp || Date.now(),
      processedOn: item.processedOn,
      finishedOn: item.finishedOn,
      async getState() {
        self.loadState();
        return this.status;
      },
      async updateProgress(p: JobProgressUpdate | number) {
        this.progress = p;
        self.saveState();
        queueEvents.emit('progress', { jobId: this.id, progress: p });
      },
    };
  }

  async addJob(data: VideoProcessingJobData): Promise<UnifiedJob> {
    this.loadState();

    const job = this.createUnifiedJobObject({
      id: data.jobId,
      data,
      status: 'waiting',
      progress: 0,
      timestamp: Date.now(),
    });

    this.jobs.set(job.id, job);
    if (!this.waitingIds.includes(job.id)) {
      this.waitingIds.push(job.id);
    }
    this.saveState();

    this.dispatch();
    return job;
  }

  async getJob(id: string): Promise<UnifiedJob | null> {
    this.loadState();
    return this.jobs.get(id) || null;
  }

  async getJobs(statuses: string[]): Promise<UnifiedJob[]> {
    this.loadState();
    const list: UnifiedJob[] = [];
    for (const job of this.jobs.values()) {
      if (statuses.includes(job.status)) {
        list.push(job);
      }
    }
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getMetrics() {
    this.loadState();
    let waiting = 0;
    let active = 0;
    let completed = 0;
    let failed = 0;

    for (const job of this.jobs.values()) {
      if (job.status === 'waiting') waiting++;
      else if (job.status === 'active') active++;
      else if (job.status === 'completed') completed++;
      else if (job.status === 'failed') failed++;
    }

    return {
      waiting,
      active,
      completed,
      failed,
      total: this.jobs.size,
    };
  }

  setProcessor(
    processor: (job: UnifiedJob) => Promise<VideoProcessingResult>,
    concurrency = 2
  ) {
    this.processor = processor;
    this.concurrency = concurrency;
    this.loadState();
    this.dispatch();

    // Check periodically for new jobs from the web server
    setInterval(() => {
      this.loadState();
      this.dispatch();
    }, 1000);
  }

  private async dispatch() {
    if (!this.processor) return;

    while (this.activeIds.size < this.concurrency && this.waitingIds.length > 0) {
      const nextId = this.waitingIds.shift();
      if (!nextId) break;

      const job = this.jobs.get(nextId);
      console.log(`[Queue Worker] Dispatching job: ${nextId}, status: ${job?.status}`);
      if (!job || job.status !== 'waiting') continue;

      this.activeIds.add(nextId);
      job.status = 'active';
      job.processedOn = Date.now();
      this.saveState();
      console.log(`[Queue Worker] Invoking processor for job: ${nextId}`);
      queueEvents.emit('active', job);

      // Process asynchronously
      (async () => {
        try {
          const result = await this.processor!(job);
          job.status = 'completed';
          job.returnvalue = result;
          job.finishedOn = Date.now();
          job.progress = 100;
          this.saveState();
          queueEvents.emit('completed', { job, result });
        } catch (err: any) {
          job.status = 'failed';
          job.failedReason = err.message || 'Processing failed';
          job.finishedOn = Date.now();
          this.saveState();
          queueEvents.emit('failed', { job, error: err });
        } finally {
          this.activeIds.delete(nextId);
          this.saveState();
          this.dispatch(); // Pick next job
        }
      })();
    }
  }
}

// Singleton embedded engine
declare global {
  // eslint-disable-next-line no-var
  var __embeddedQueue: EmbeddedQueueEngine | undefined;
}

export function getEmbeddedQueue(): EmbeddedQueueEngine {
  if (!global.__embeddedQueue) {
    global.__embeddedQueue = new EmbeddedQueueEngine();
  }
  return global.__embeddedQueue;
}
