import { q } from './db.mjs';

export async function audit(user, action, entity, entityId, detail) {
  try {
    await q('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)', [
      user?.id || null, action, entity || null, entityId ? String(entityId) : null, detail ? JSON.stringify(detail) : null,
    ]);
  } catch (e) {
    console.error('[audit]', e.message);
  }
}
