import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/env';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

// Ensure storage directories exist
export function initStorageDirectories() {
  if (!fs.existsSync(CONFIG.RAW_DIR)) {
    fs.mkdirSync(CONFIG.RAW_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG.OUTPUTS_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUTS_DIR, { recursive: true });
  }
}

// S3 Client initialization if S3 driver is enabled
let s3Client: S3Client | null = null;
if (CONFIG.STORAGE_DRIVER === 's3' && CONFIG.AWS_S3_BUCKET) {
  s3Client = new S3Client({
    region: CONFIG.AWS_REGION,
    credentials: {
      accessKeyId: CONFIG.AWS_ACCESS_KEY_ID,
      secretAccessKey: CONFIG.AWS_SECRET_ACCESS_KEY,
    },
    endpoint: CONFIG.AWS_S3_ENDPOINT,
    forcePathStyle: !!CONFIG.AWS_S3_ENDPOINT, // Required for MinIO
  });
}

export class StorageService {
  /**
   * Save uploaded buffer or stream to raw storage
   */
  static async saveRawFile(fileName: string, buffer: Buffer): Promise<string> {
    initStorageDirectories();
    const filePath = path.join(CONFIG.RAW_DIR, fileName);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Create a job-specific output directory
   */
  static getJobOutputDir(jobId: string): string {
    initStorageDirectories();
    const jobDir = path.join(CONFIG.OUTPUTS_DIR, jobId);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    return jobDir;
  }

  /**
   * Upload file to AWS S3 if enabled
   */
  static async uploadToS3(key: string, localFilePath: string, contentType: string): Promise<string> {
    if (!s3Client || !CONFIG.AWS_S3_BUCKET) {
      throw new Error('S3 Client is not configured. Set STORAGE_DRIVER=s3 and AWS credentials.');
    }

    const fileContent = fs.readFileSync(localFilePath);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: CONFIG.AWS_S3_BUCKET,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
      })
    );

    return `https://${CONFIG.AWS_S3_BUCKET}.s3.${CONFIG.AWS_REGION}.amazonaws.com/${key}`;
  }

  /**
   * Format media URL for the Next.js streaming endpoint or S3
   */
  static getPublicMediaUrl(jobId: string, fileName: string): string {
    return `/api/media/${jobId}/${fileName}`;
  }
}
