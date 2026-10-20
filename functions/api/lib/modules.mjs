import { one } from './db.mjs';
import { fail } from './http.mjs';

// Optional modules a company can switch off in Settings
export const MODULES = ['academy', 'toolbox', 'everyday'];

export async function moduleOn(name) {
  const s = await one('SELECT modules FROM settings WHERE id = 1');
  return (s?.modules || {})[name] !== false;
}

export async function requireModule(name) {
  if (!(await moduleOn(name))) fail(403, 'This module is switched off');
}
