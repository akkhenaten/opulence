// RFC 5322 / MIME message for Gmail (Graph takes JSON instead).
import crypto from 'node:crypto';
import { htmlToText } from './html.mjs';

const ascii = (s) => /^[\x20-\x7e]*$/.test(s);
/** RFC 2047 encoded-word for non-ASCII header text. */
export const encodeWord = (s) => (ascii(String(s)) ? String(s) : `=?UTF-8?B?${Buffer.from(String(s), 'utf8').toString('base64')}?=`);

export function formatAddr({ name, email }) {
  if (!name) return email;
  const n = ascii(name) ? `"${name.replace(/["\\]/g, '')}"` : encodeWord(name);
  return `${n} <${email}>`;
}

const wrap = (b64) => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
const b64 = (s) => wrap(Buffer.from(s).toString('base64'));
const safeName = (n) => String(n || 'file').replace(/["\r\n\\]/g, '_');

/**
 * Builds the raw message. msg: { from, to[], cc[], bcc[], subject, html, attachments[{name, mime, bytes}], inReplyTo?, references? }
 * Returns a Buffer.
 */
export function buildMime(msg) {
  const boundary = (p) => `=_${p}_${crypto.randomBytes(12).toString('hex')}`;
  const alt = boundary('alt');
  const head = [
    `From: ${formatAddr(msg.from)}`,
    msg.to?.length && `To: ${msg.to.map(formatAddr).join(', ')}`,
    msg.cc?.length && `Cc: ${msg.cc.map(formatAddr).join(', ')}`,
    msg.bcc?.length && `Bcc: ${msg.bcc.map(formatAddr).join(', ')}`,
    `Subject: ${encodeWord(msg.subject || '')}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${(msg.from.email.split('@')[1] || 'mail')}>`,
    msg.inReplyTo && `In-Reply-To: ${msg.inReplyTo}`,
    (msg.references || msg.inReplyTo) && `References: ${[msg.references, msg.inReplyTo].filter(Boolean).join(' ').trim()}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  const body = [
    `--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(htmlToText(msg.html)),
    `--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(msg.html || ''),
    `--${alt}--`,
  ];
  const atts = msg.attachments || [];
  if (!atts.length) return Buffer.from([...head, `Content-Type: multipart/alternative; boundary="${alt}"`, '', ...body, ''].join('\r\n'));

  const mixed = boundary('mix');
  const parts = [
    ...head, `Content-Type: multipart/mixed; boundary="${mixed}"`, '',
    `--${mixed}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '', ...body,
  ];
  for (const a of atts) {
    const name = encodeWord(safeName(a.name));
    parts.push(`--${mixed}`, `Content-Type: ${a.mime || 'application/octet-stream'}; name="${name}"`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${name}"`, '', wrap(Buffer.from(a.bytes).toString('base64')));
  }
  parts.push(`--${mixed}--`, '');
  return Buffer.from(parts.join('\r\n'));
}
