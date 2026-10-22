import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setSide, setToken } from './api.js';

const AuthCtx = createContext(null);
const DEFAULT_BRAND = { name: 'Orb Security', logo_url: null, color: '#0A6CFF' };
export const useAuth = () => useContext(AuthCtx);

// Home path per role
export const HOME = { company: '/company', security: '/security', venue: '/venue', officer: '/officer' };
// The other side of a manager who also works shifts (null for everyone else)
export const otherSide = (u) => (!u?.dual ? null : u.role === 'officer' ? u.login_role : 'officer');

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, company: '', ready: !getToken() });
  // The company's name, logo and colour; shown on the sign-in page too
  const [brand, setBrand] = useState(DEFAULT_BRAND);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      api('settings.brand').then(setBrand).catch(() => {});
      return setState({ user: null, company: '', ready: true });
    }
    try {
      const { user, company_name, brand: b } = await api('auth.me');
      if (b) setBrand(b);
      setState({ user, company: company_name, ready: true });
    } catch {
      setState({ user: null, company: '', ready: true });
    }
  }, []);

  useEffect(() => { document.title = brand.name; }, [brand.name]);

  useEffect(() => {
    refresh();
    const out = () => setState({ user: null, company: '', ready: true });
    window.addEventListener('orb:signed-out', out);
    return () => window.removeEventListener('orb:signed-out', out);
  }, [refresh]);

  const signIn = useCallback(async (session) => {
    setToken(session.token);
    setSide(null);
    let { user } = session;
    // A manager who also works shifts lands on "My shifts" when they are on shift or due on within 2 hours
    if (user.dual) {
      const { side } = await api('auth.landing').catch(() => ({ side: 'manager' }));
      setSide(side);
      if (side === 'officer') user = (await api('auth.me')).user;
    }
    setState((s) => ({ ...s, user, ready: true }));
    refresh();
    return user;
  }, [refresh]);

  // Switch between "Manager" and "My shifts"; returns the user as seen on the new side
  const switchSide = useCallback(async (side) => {
    setSide(side);
    const { user, company_name } = await api('auth.me');
    setState((s) => ({ ...s, user, company: company_name || s.company, ready: true }));
    return user;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setSide(null);
    setState({ user: null, company: '', ready: true });
  }, []);

  return <AuthCtx.Provider value={{ ...state, brand, signIn, signOut, refresh, switchSide }}>{children}</AuthCtx.Provider>;
}

// Notification links are written for company managers; map them into the viewer's portal
export function portalLink(link, role) {
  if (!link) return HOME[role];
  if (link.startsWith('/everyday') || link.startsWith('/messages')) return `${HOME[role] === '/' ? '' : HOME[role]}${link}`;
  // One shift page for everyone: officers, managers and the venue each open it in their own portal
  if (link.startsWith('/officer/shifts/') && role !== 'officer') return link.replace('/officer/shifts/', role === 'venue' ? '/venue/logs/' : `/${role}/shifts/`);
  if (role === 'security') return link.replace(/^\/company/, '/security');
  return link;
}
