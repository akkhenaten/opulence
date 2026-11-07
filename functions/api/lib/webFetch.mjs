import dns from 'node:dns/promises';
import { isPrivateHost } from './feed.mjs';

const UA = 'Mozilla/5.0 (compatible; EverydayLinkPreview/1.0)';

/**
 * Fetch a public web page or image: http(s) on the standard ports only, never an internal address (checked on every
 * redirect), a short timeout and a size cap. `truncated` is true when the body was cut at maxBytes.
 */
export async function safeFetch(url, { maxBytes, accept, ua = UA, timeout = 4000 }) {
  let target = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const u = new URL(target);
    if (!['http:', 'https:'].includes(u.protocol) || (u.port && !['80', '443'].includes(u.port))) throw new Error('blocked');
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateHost(a.address))) throw Object.assign(new Error('blocked'), { blocked: true });
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': ua, Accept: accept } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { target = new URL(r.headers.get('location'), u).href; continue; }
    if (!r.ok) throw new Error(`status ${r.status}`);
    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { truncated = true; reader.cancel().catch(() => {}); break; }
      chunks.push(value);
    }
    return { url: u.href, type: r.headers.get('content-type') || '', bytes: Buffer.concat(chunks), truncated };
  }
  throw new Error('too many redirects');
}
