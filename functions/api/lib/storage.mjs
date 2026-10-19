import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';

let s3;
const client = () => (s3 ||= new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' }));

const safe = (name) => String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);

// Private keys live under docs/ (not served by the CDN)
export async function uploadUrl(folder, filename, contentType) {
  const key = `docs/${folder}/${crypto.randomUUID()}-${safe(filename)}`;
  const url = await getSignedUrl(client(), new PutObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 900 });
  return { key, url };
}

export async function downloadUrl(key, filename) {
  if (!key) return null;
  const cmd = new GetObjectCommand({
    Bucket: process.env.STORAGE_BUCKET, Key: key,
    ...(filename ? { ResponseContentDisposition: `inline; filename="${safe(filename)}"` } : {}),
  });
  return getSignedUrl(client(), cmd, { expiresIn: 600 });
}

export async function getObjectBytes(key) {
  const res = await client().send(new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}
