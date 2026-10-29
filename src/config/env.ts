import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
  // Server
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,

  // Queue names
  QUEUE_NAME: 'video-transcode-pipeline',

  // Local Storage Directories
  STORAGE_DIR: process.env.STORAGE_DIR 
    ? path.resolve(process.env.STORAGE_DIR) 
    : path.join(process.cwd(), 'storage'),
  RAW_DIR: path.join(process.cwd(), 'storage', 'raw'),
  OUTPUTS_DIR: path.join(process.cwd(), 'storage', 'outputs'),

  // Storage Driver: 'local' | 's3'
  STORAGE_DRIVER: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3',

  // AWS S3 Configuration (Optional - for cloud deployment)
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || '',
  AWS_S3_ENDPOINT: process.env.AWS_S3_ENDPOINT || undefined, // For MinIO or LocalStack

  // Production Guards & Policies
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10),
  DELETE_RAW_AFTER_TRANSCODE: process.env.DELETE_RAW_AFTER_TRANSCODE === 'true',
  ALLOWED_EXTENSIONS: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'],
  ENABLE_HLS: process.env.ENABLE_HLS === 'true',
};
