import { fail } from './http.mjs';
import { ALL, def } from '../modules/_def.mjs';

// The platform admin is set by the platform's configuration, never from a screen in the app
export const platformEmails = () => String(process.env.PLATFORM_ADMINS || 'info@orbsolutions.co.uk')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export const isPlatformEmail = (email) => !!email && platformEmails().includes(String(email).trim().toLowerCase());
// Only the person's own sign-in counts, never someone they are acting as
export const isPlatformAdmin = (u) => !!u && u.status !== 'disabled' && isPlatformEmail(u.email);

// The platform admin always has the full Company manager side, whatever role the login was created with
export const needsPlatformRole = (row) => !!row && isPlatformAdmin(row) && row.role !== 'company';
export const inviteRole = (email, role) => (isPlatformEmail(email) ? 'company' : role);

/** A platform-only action: open to any signed-in role, then checked against the platform list on the server. */
export const plat = (fn) => def(ALL, async (b, ctx) => {
  if (!isPlatformAdmin(ctx.user)) fail(403, 'You do not have access to this');
  return fn(b, ctx);
});

/** Nobody but the platform admin can put a platform email on an account, or take over or switch off a platform account. */
export function guardPlatformAccount(actor, ...emails) {
  if (emails.some(isPlatformEmail) && !isPlatformAdmin(actor)) fail(403, 'This account belongs to the platform and can only be changed by the platform admin');
}
