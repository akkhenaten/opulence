import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

export async function putObject(key, bytes, contentType) {
  await client().send(new PutObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key, Body: bytes, ContentType: contentType }));
  return key;
}

export async function getObjectBytes(key) {
  const res = await client().send(new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function deleteObject(key) {
  if (key) await client().send(new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }));
}

// Size and type of an uploaded object, or null when it does not exist
export async function headObject(key) {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }));
    return { size: Number(r.ContentLength || 0), mime: r.ContentType || '' };
  } catch {
    return null;
  }
}

// A profile photo must be an image this person uploaded themselves (files.uploadUrl purpose "photo"), under 10 MB.
// '' or null clears the photo.
export async function checkOwnPhoto(user, key, fail) {
  if (!key) return null;
  if (!String(key).startsWith(`docs/photos/${user.id.slice(0, 8)}/`)) fail(400, 'Upload the photo first');
  const h = await headObject(key);
  if (!h) fail(400, 'Upload the photo first');
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(h.mime)) fail(400, 'The photo must be an image');
  if (h.size > 10 * 1024 * 1024) fail(400, 'The photo must be under 10 MB');
  return key;
}
