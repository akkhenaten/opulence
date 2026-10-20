import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Home path per role
export const HOME = { company: '/company', security: '/security', venue: '/venue', officer: '/officer' };

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, company: '', ready: !getToken() });

  const refresh = useCallback(async () => {
    if (!getToken()) return setState({ user: null, company: '', ready: true });
    try {
      const { user, company_name } = await api('auth.me');
      setState({ user, company: company_name, ready: true });
    } catch {
      setState({ user: null, company: '', ready: true });
    }
  }, []);

  useEffect(() => {
    refresh();
    const out = () => setState({ user: null, company: '', ready: true });
    window.addEventListener('orb:signed-out', out);
    return () => window.removeEventListener('orb:signed-out', out);
  }, [refresh]);

  const signIn = useCallback(async (session) => {
    setToken(session.token);
    setState((s) => ({ ...s, user: session.user, ready: true }));
    refresh();
    return session.user;
  }, [refresh]);

  const signOut = useCallback(() => {
    setToken(null);
    setState({ user: null, company: '', ready: true });
  }, []);

  return <AuthCtx.Provider value={{ ...state, signIn, signOut, refresh }}>{children}</AuthCtx.Provider>;
}

// Notification links are written for company managers; map them into the viewer's portal
export function portalLink(link, role) {
  if (!link) return HOME[role];
  if (link.startsWith('/everyday')) return `${HOME[role] === '/' ? '' : HOME[role]}${link}`;
  if (role === 'security') return link.replace(/^\/company/, '/security');
  return link;
}
