// Face checks: a decision aid, never an identification and never a block on clocking in.
// Gemini compares the officer's profile photo with a clock-in selfie, or with the photo on an uploaded ID or licence
// (or that photo with the one on their other document);
// anything that goes wrong gives 'unscored'.
import { checkCap, logUsage, creditsFor } from './ai.mjs';

export const FACE_MODEL = 'gemini-flash-latest';
const FACE_CREDITS = 300;
const RESULTS = ['match', 'unsure', 'no_match'];

function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  return null;
}

const SELFIE_PROMPT = 'A security company checks that the person clocking in to a shift is the officer on its staff record. Image 1 is the staff profile photo. Image 2 is a selfie taken at clock-in. Do these show the same person? Answer "match" if clearly the same person, "no_match" if clearly a different person, "unsure" if the selfie is unclear, covered, too dark or you cannot tell. This only helps a manager decide whether to look closer. Give a short plain-English note (under 20 words) about what you saw, without describing ethnicity, age or other personal characteristics.';
const DOC_PROMPT = 'A security company checks that an uploaded identity document belongs to the officer on its staff record. Image 1 is the staff profile photo. Image 2 is a photo or PDF scan of an ID document or SIA licence card, which has a small printed photo of its holder. Is the holder in the document photo the same person as in the profile photo? Answer "match" if clearly the same person, "no_match" if clearly a different person, "unsure" if the document photo is too small, unclear, covered or missing, or you cannot tell. Give a short plain-English note (under 20 words) about what you saw, without describing ethnicity, age or other personal characteristics.';

const PAIR_PROMPT = 'A security company checks that two identity documents uploaded by one officer belong to the same person. Item 1 and item 2 are each a photo or PDF scan of a passport, ID card or SIA licence card, each with a small printed photo of its holder. Is the holder the same person on both? Answer "match" if clearly the same person, "no_match" if clearly a different person, "unsure" if either photo is too small, unclear, covered or missing, or you cannot tell. Give a short plain-English note (under 20 words) about what you saw, without describing ethnicity, age or other personal characteristics.';

/** { result: match|unsure|no_match|unscored, note } */
export const faceMatch = ({ selfie, profile }) => compare(SELFIE_PROMPT, profile, selfie, 'clock_face');

/** The photo on an uploaded ID or licence against the profile photo: { result, note } */
export const docFaceMatch = ({ doc, profile }) => compare(DOC_PROMPT, profile, doc, 'ops');

/** The holder photos on two of the officer's own documents (passport and SIA card), when there's no profile photo to use */
export const docPairMatch = ({ a, b }) => compare(PAIR_PROMPT, a, b, 'ops');

async function compare(prompt, profile, other, module) {
  const sm = other && sniff(other);
  const pm = profile && sniff(profile);
  if (!sm || !pm) return { result: 'unscored', note: 'Photo could not be read' };
  try {
    await checkCap(module);
  } catch {
    return { result: 'unscored', note: 'Face check paused (monthly AI cap reached)' };
  }
  try {
    const res = await fetch(`https://proxy.openkbs.com/v1/google/models/${FACE_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENKBS_API_KEY}` },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: prompt },
          { inlineData: { mimeType: pm, data: profile.toString('base64') } },
          { inlineData: { mimeType: sm, data: other.toString('base64') } },
        ] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: { result: { type: 'STRING', enum: RESULTS }, note: { type: 'STRING' } }, required: ['result', 'note'] },
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json().catch(() => ({}));
    const u = data.usageMetadata || {};
    if (res.ok) await logUsage(module, creditsFor({ input_tokens: u.promptTokenCount, output_tokens: u.candidatesTokenCount }, {}) || FACE_CREDITS);
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    let out;
    try { out = JSON.parse(text); } catch { out = null; }
    if (!res.ok || !out || !RESULTS.includes(out.result)) {
      console.error('[face]', res.status, JSON.stringify(data).slice(0, 300));
      return { result: 'unscored', note: 'Face check not available right now' };
    }
    return { result: out.result, note: String(out.note || '').slice(0, 200) };
  } catch (e) {
    console.error('[face]', e.message);
    return { result: 'unscored', note: 'Face check not available right now' };
  }
}
