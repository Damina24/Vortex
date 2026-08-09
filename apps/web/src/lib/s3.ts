import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

const region = process.env.S3_REGION || "us-east-1";
const endpoint = process.env.S3_ENDPOINT || undefined;
const bucket = process.env.S3_BUCKET || "vortex-assets";

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "minioadmin",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "minioadmin",
      },
    });
  }
  return s3Client;
}

/**
 * Ensures the target bucket exists. Works with MinIO out of the box and with
 * any S3-compatible provider that supports CreateBucket for never-created
 * buckets.
 */
export async function ensureBucket(): Promise<void> {
  const client = getClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

/**
 * Uploads a buffer to the configured bucket and returns a browser-accessible
 * URL built from S3_PUBLIC_URL (falls back to S3_ENDPOINT).
 */
export async function uploadToS3(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const client = getClient();
  await ensureBucket();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );

  const publicBase = (process.env.S3_PUBLIC_URL || endpoint || "").replace(/\/+$/, "");
  const cleanKey = params.key.replace(/^\/+/, "");
  return `${publicBase}/${cleanKey}`;
}