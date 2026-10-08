import { Worker } from 'bullmq';
import { CONFIG } from '../config/env';
import { redisConnectionOptions } from '../lib/redis';
import { processVideoJob } from './processor';
import { initStorageDirectories } from '../lib/storage';
import { VideoProcessingJobData, VideoProcessingResult } from '../lib/types';
import {
  checkRedisBullMQCompatibility,
  getEmbeddedQueue,
  queueEvents,
} from '../lib/queue-manager';

// Ensure storage folders exist
initStorageDirectories();

async function main() {
  console.log('='.repeat(65));
  console.log('   STREAMFORGE DISTRIBUTED TRANSCODE WORKER SERVICE');
  console.log(`   Queue Name : ${CONFIG.QUEUE_NAME}`);
  console.log(`   Redis Host : ${CONFIG.REDIS_HOST}:${CONFIG.REDIS_PORT}`);
  console.log(`   Storage    : ${CONFIG.STORAGE_DRIVER.toUpperCase()}`);
  console.log('='.repeat(65));

  const hasBullMQ = await checkRedisBullMQCompatibility();

  if (hasBullMQ) {
    console.log(' [Engine] Initializing BullMQ Redis Worker (Distributed Cluster Mode)...');

    const worker = new Worker<VideoProcessingJobData, VideoProcessingResult>(
      CONFIG.QUEUE_NAME,
      async (job) => {
        return await processVideoJob(job);
      },
      {
        connection: redisConnectionOptions,
        concurrency: 2,
        lockDuration: 60000,
      }
    );

    worker.on('ready', () => {
      console.log(' [Worker Ready] Connected to Redis 5+ cluster and listening for transcode jobs.');
    });

    worker.on('active', (job) => {
      console.log(` [Job Active] Job ${job.id} started processing.`);
    });

    worker.on('completed', (job, result) => {
      console.log(` [Job Completed] Job ${job.id} finished successfully.`);
      console.log(`   - Renditions: ${result.renditions.map((r) => r.resolution).join(', ')}`);
      console.log(`   - Thumbnails: ${result.thumbnails.length} frames`);
    });

    worker.on('failed', (job, err) => {
      console.error(` [Job Failed] Job ${job?.id} failed:`, err.message);
    });

    const shutdown = async () => {
      console.log('\n[Worker] Gracefully closing BullMQ connections...');
      await worker.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    console.log(' [Engine] Running in High-Performance Asynchronous Embedded Worker Mode...');
    const queue = getEmbeddedQueue();

    queue.setProcessor(async (job) => {
      return await processVideoJob(job);
    }, 2);

    queueEvents.on('active', (job) => {
      console.log(` [Job Active] Job ${job.id} started processing.`);
    });

    queueEvents.on('completed', ({ job, result }) => {
      console.log(` [Job Completed] Job ${job.id} finished successfully.`);
      console.log(`   - Renditions: ${result.renditions.map((r: any) => r.resolution).join(', ')}`);
      console.log(`   - Thumbnails: ${result.thumbnails.length} frames`);
    });

    queueEvents.on('failed', ({ job, error }) => {
      console.error(` [Job Failed] Job ${job.id} failed:`, error.message);
    });

    console.log(' [Worker Ready] Worker active and continuously processing queued video jobs.');

    // Keep process alive
    setInterval(() => {}, 10000);
  }
}

main().catch((err) => {
  console.error('[Worker Fatal Error]:', err);
});
