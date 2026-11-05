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

// Public copies (logo, venue photos) are served by the CDN under media/ on the app domain
export const publicUrl = (key) => `${(process.env.APP_URL || '').replace(/\/$/, '')}/${key}`;

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
    return { size: Number(r.ContentLength || 0), mime: r.ContentType || '', modified: r.LastModified ? new Date(r.LastModified) : null };
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

// The small (256px) version of a photo lives next to it, so no column is needed and old photos simply have none
export const thumbKeyOf = (key) => (key ? `${key}.sm.jpg` : null);

// Moves the uploaded small version (tmpKey) next to the saved photo. A missing or bad small version never blocks
// the save: lists then fall back to the large photo.
export async function saveThumb(user, photoKey, tmpKey) {
  if (!photoKey || !tmpKey || tmpKey === photoKey) return;
  try {
    if (!String(tmpKey).startsWith(`docs/photos/${user.id.slice(0, 8)}/`)) return;
    const h = await headObject(tmpKey);
    if (!h || !/^image\/(jpeg|png|webp)$/.test(h.mime) || h.size > 1024 * 1024) return;
    await putObject(thumbKeyOf(photoKey), await getObjectBytes(tmpKey), 'image/jpeg');
    await deleteObject(tmpKey);
  } catch (e) {
    console.error('saveThumb', e.message);
  }
}

// Signed links for a photo and its small version
export const photoUrls = async (key) => ({ photo_url: await downloadUrl(key), photo_thumb_url: await downloadUrl(thumbKeyOf(key)) });
