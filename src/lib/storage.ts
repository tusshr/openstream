import { S3Client } from "bun";

import { env } from "@/env";

// Reads S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_ENDPOINT, S3_BUCKET
// from env automatically — no explicit config needed unless using multiple buckets
export const s3 = new S3Client({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  bucket: env.S3_BUCKET,
  region: env.S3_REGION ?? "us-east-1",
  // Cloudflare R2: endpoint: "https://<id>.r2.cloudflarestorage.com"
  // MinIO (local):  endpoint: "http://localhost:9000"
  ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT }),
});
