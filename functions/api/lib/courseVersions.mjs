// Course versions: a snapshot of each published version, and courses whose titles look like the same course twice

/** Keep the published course as it is now under its current version. db: { one, q } (a transaction or the pool). */
export async function snapshotCourse(db, courseId, user) {
  const c = await db.one('SELECT id, title, summary, status, version, pass_mark, renew_months FROM courses WHERE id = $1', [courseId]);
  if (!c || c.status !== 'published' || !c.version) return null;
  const [sections, questions] = await Promise.all([
    db.q('SELECT title, body, blocks, quick_check FROM course_sections WHERE course_id = $1 ORDER BY position, title', [courseId]),
    db.q('SELECT prompt, options, answer, explain FROM course_questions WHERE course_id = $1 AND active ORDER BY section_id, id', [courseId]),
  ]);
  const content = { summary: c.summary, pass_mark: c.pass_mark, renew_months: c.renew_months, sections, questions };
  // A re-save without a new version refreshes the snapshot of the current one
  await db.q(`INSERT INTO course_versions (course_id, version, title, content, published_by) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (course_id, version) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content`,
  [courseId, c.version, c.title, JSON.stringify(content), user?.id || null]);
  return c.version;
}

const STOP = new Set(['a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'with', 'course', 'training', 'basics', 'intro', 'introduction', 'v1', 'v2', 'new', 'copy']);
export const titleWords = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** True when two titles name the same course: the same words once filler is dropped, or a near-identical spelling. */
export function looksSimilar(a, b) {
  const x = titleWords(a), y = titleWords(b);
  if (!x.length || !y.length) return false;
  const kx = [...new Set(x)].sort().join(' '), ky = [...new Set(y)].sort().join(' ');
  if (kx === ky) return true;
  const sx = x.join(' '), sy = y.join(' ');
  return Math.max(sx.length, sy.length) >= 8 && distance(sx, sy) <= Math.max(2, Math.floor(Math.max(sx.length, sy.length) / 8));
}

/** Pairs of courses (not archived) that look like the same course. courses: [{ id, title, status }] */
export function similarPairs(courses) {
  const live = courses.filter((c) => c.status !== 'archived');
  const out = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) if (looksSimilar(live[i].title, live[j].title)) out.push([live[i], live[j]]);
  return out;
}
