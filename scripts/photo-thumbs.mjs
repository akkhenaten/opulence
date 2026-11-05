// One-off: makes the small (256px) version for staff, user and venue photos stored before small versions existed.
// Only adds `<photo>.sm.jpg` files next to the originals; never changes or removes anything.
// Needs ImageMagick (`convert`). Lists what it would do unless --apply is given:
//   DATABASE_URL=... STORAGE_BUCKET=... node scripts/photo-thumbs.mjs [--apply]
import { execFileSync } from 'node:child_process';
import { q } from '../functions/api/lib/db.mjs';
import { getObjectBytes, headObject, putObject, thumbKeyOf } from '../functions/api/lib/storage.mjs';

const APPLY = process.argv.includes('--apply');

async function main() {
  const rows = await q(`SELECT photo_key FROM officers WHERE photo_key IS NOT NULL
    UNION SELECT photo_key FROM users WHERE photo_key IS NOT NULL
    UNION SELECT photo_key FROM venues WHERE photo_key IS NOT NULL`);
  let made = 0, had = 0, failed = 0;
  for (const { photo_key: key } of rows) {
    const thumb = thumbKeyOf(key);
    if (await headObject(thumb)) { had++; continue; }
    if (!APPLY) { console.log('would make', thumb); made++; continue; }
    try {
      const small = execFileSync('convert', ['-', '-auto-orient', '-resize', '256x256>', '-strip', '-quality', '80', 'jpg:-'], { input: await getObjectBytes(key), maxBuffer: 8 * 1024 * 1024 });
      await putObject(thumb, small, 'image/jpeg');
      console.log('made', thumb, `${Math.round(small.length / 1024)} KB`);
      made++;
    } catch (e) {
      console.error('failed', key, e.message);
      failed++;
    }
  }
  console.log(`${APPLY ? 'Made' : 'Would make'} ${made}, already had ${had}, failed ${failed} (of ${rows.length} photos).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
