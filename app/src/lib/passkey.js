// Passkeys for the officer's clock-in phone: the phone's own fingerprint, face or PIN unlock proves it is this phone.
const toBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const passkeySupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials?.create;

function friendly(e, creating) {
  const n = e?.name || '';
  if (n === 'NotAllowedError') return new Error('The phone check was cancelled or timed out. Try again.');
  if (n === 'InvalidStateError' && creating) return new Error('This phone is already registered.');
  if (n === 'NotSupportedError' || n === 'SecurityError') return new Error("This browser can't check your phone. Use Safari on iPhone or Chrome on Android.");
  return new Error(e?.message || 'The phone check did not work. Try again.');
}

export async function createPasskey(o) {
  if (!passkeySupported()) throw friendly({ name: 'NotSupportedError' });
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        ...o,
        challenge: toBuf(o.challenge),
        user: { ...o.user, id: toBuf(o.user.id) },
        excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: toBuf(c.id) })),
      },
    });
    return { id: cred.id, clientDataJSON: toB64(cred.response.clientDataJSON), attestationObject: toB64(cred.response.attestationObject) };
  } catch (e) {
    throw friendly(e, true);
  }
}

export async function getPasskey(o) {
  if (!passkeySupported()) throw friendly({ name: 'NotSupportedError' });
  try {
    const cred = await navigator.credentials.get({
      publicKey: { ...o, challenge: toBuf(o.challenge), allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: toBuf(c.id) })) },
    });
    return {
      id: cred.id,
      clientDataJSON: toB64(cred.response.clientDataJSON),
      authenticatorData: toB64(cred.response.authenticatorData),
      signature: toB64(cred.response.signature),
    };
  } catch (e) {
    throw friendly(e, false);
  }
}
