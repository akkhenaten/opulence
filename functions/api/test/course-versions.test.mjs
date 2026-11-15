// Course versions: a snapshot when a course is published and on each later version; courses that look the same
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksSimilar, similarPairs, snapshotCourse } from '../lib/courseVersions.mjs';

function fakeDb(course) {
  const kept = new Map();
  return {
    kept,
    course,
    one: async (sql) => (/FROM courses/.test(sql) ? { ...course } : null),
    q: async (sql, p) => {
      if (/INSERT INTO course_versions/.test(sql)) { kept.set(p[1], { title: p[2], content: JSON.parse(p[3]) }); return []; }
      if (/course_sections/.test(sql)) return [{ title: 'Lesson 1', body: 'Text', blocks: [], quick_check: null }];
      return [{ prompt: 'Q?', options: ['a', 'b'], answer: 0, explain: '' }];
    },
  };
}

test('publishing keeps a snapshot, and the next version keeps its own', async () => {
  const db = fakeDb({ id: 'c1', title: 'Conflict management', status: 'published', version: 1, summary: '' });
  assert.equal(await snapshotCourse(db, 'c1', { id: 'u1' }), 1);
  db.course.version = 2; db.course.title = 'Conflict management (2026)';
  await snapshotCourse(db, 'c1', { id: 'u1' });
  assert.deepEqual([...db.kept.keys()], [1, 2]);
  assert.equal(db.kept.get(1).title, 'Conflict management');
  assert.equal(db.kept.get(2).content.sections[0].title, 'Lesson 1');
});

test('a draft course keeps no snapshot', async () => {
  const db = fakeDb({ id: 'c1', title: 'Draft', status: 'draft', version: 0 });
  assert.equal(await snapshotCourse(db, 'c1', null), null);
  assert.equal(db.kept.size, 0);
});

test('near-identical titles pair up; different courses stay apart', () => {
  assert.ok(looksSimilar('Conflict Management', 'Conflict management course'));
  assert.ok(looksSimilar('First aid basics', 'First Aid'));
  assert.ok(looksSimilar('Licensing law', 'Licencing law'));
  assert.ok(!looksSimilar('First aid', 'Licensing law'));
  assert.ok(!looksSimilar('Drugs awareness', 'Crowd safety'));
  const pairs = similarPairs([
    { id: 'a', title: 'Conflict management', status: 'published' },
    { id: 'b', title: 'Conflict Management (copy)', status: 'draft' },
    { id: 'c', title: 'Conflict management', status: 'archived' },
    { id: 'd', title: 'Crowd safety', status: 'published' },
  ]);
  assert.deepEqual(pairs.map((p) => p.map((c) => c.id)), [['a', 'b']]);
});
