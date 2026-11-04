# Plan: Tune Orb voice cost estimate and set a default voice cap

## Context
The user asked what Orb voice has actually cost so far, and to tune the per-minute estimate and the default "Orb voice" cap.

**What the data shows (read-only checks done):**
- **Logged usage:** `ai_usage` for 2026-11 has `orb_voice` = **4,000 app credits**. That is two ~13-second test sessions, each charged the flat minimum of 2,000. Neither figure is measured: both are the fallback estimate.
- **Why no real figure ever arrives:** the Live SDK (`live.js`) only emits `closed` with `credits` when the **server** closes the session (budget, or `maxSessionMs`). When the manager taps End, `stop()` just closes the socket, so the app never sees the true total and always falls back to the estimate.
- **Platform cost model** (`.claude/skills/openkbs/reference/live-voice.md` → Cost):
  - The relay bills per 1K tokens and re-reads the whole context on every turn, so a conversation gets more expensive per minute as it goes on.
  - The documented reference point is a 10-minute talk with a short instruction ≈ **20 platform credits** on gemini-3.8-live, which is 20,000 app credits.
- **Our instruction size** (measured locally):
  - The voice prompt is about 575 tokens.
  - Tool declarations are about 2.1k tokens for company and about 1.1k for security.
  - That is about 2.7k in total, in line with the "short instruction" case the docs use.
- **What is wrong with today's estimate** (`assistant.voiceEnd`, `functions/api/modules/orbVoice.mjs:260`):
  - It charges a flat 2,000 per started minute, rounded up.
  - That overcharges short talks: a 13-second test was charged a full minute.
  - It undercharges long talks, because later minutes really cost more than earlier ones.
- **Caps today:**
  - `settings.ai_module_caps = {}`, so there is no Orb voice cap; only the overall 2,000,000 per month applies.
  - Orb (typing) has used about 136k this month.
- **User decision:** the default Orb voice cap is **300,000 app credits a month**. That is about 15 full 10-minute talks, or about 40 five-minute ones, plus dictation.

## Changes

### 1. Length-aware estimate (`functions/api/modules/orbVoice.mjs`)
- Replace the flat per-minute charge in `assistant.voiceEnd` with an exported pure function. Call it `voiceCredits(seconds)` (platform credits, ×1000 for app credits):
  - `m = seconds / 60`, using exact seconds with no rounding up to the minute.
  - `platform = 1·m + 0.1·m²`. This gives 1 minute ≈ 1.1, 5 minutes ≈ 7.5 and 10 minutes = 20, which matches the documented 20 per 10 minutes. The square term models the context being re-read on every turn.
  - The app figure is `round(platform × 1000)`.
- **Keep:** a credit figure reported by the relay (`b.credits > 0`) still wins, ×1000. The existing guard stays: at most 10,000 app credits per minute (by exact minutes, with a floor of 1 minute).
- **Record which it was:** the audit `orb.voice_session` detail gains `estimated: true|false`, so real figures can be told apart from estimates later.
- **Comment:** replace the comment above the formula with one line explaining the curve and its source (the platform docs, 20 per 10 minutes).

### 2. Default Orb voice cap (new migration `functions/api/db/migrations/020_orb_voice_cap.sql`)
```sql
UPDATE settings SET ai_module_caps = COALESCE(ai_module_caps, '{}'::jsonb) || '{"orb_voice": 300000}'::jsonb
 WHERE id = 1 AND NOT (COALESCE(ai_module_caps, '{}'::jsonb) ? 'orb_voice');
```
- It only seeds the cap when none is set, and migrations run once. If the company later blanks the field in Ops AI → Credits by feature, it stays blank.
- The value shows as 300000 in the existing caps input. No UI change is needed. Enforcement already happens in `checkCap('orb_voice')` (`lib/ai.mjs:34`) at session start and on every dictation clip.
- First check the column type in `settings` (json or jsonb). If it is `json`, cast it.

### 3. Tests (`functions/api/test/orb.test.mjs`)
`voiceCredits` gives:
- 0 for 0 seconds;
- about 220 for 13 seconds, no longer 2,000;
- 20,000 for 600 seconds;
- a curve that rises each minute (minute 10 costs more than minute 1).

## Not changing
- **Dictation:** clips are already charged from the token usage the proxy reports. The fallback is `CLIP_CREDITS` = 600, which is about right for a clip of up to 60 seconds at 0.3 per 1K tokens.
- **Mid-talk cap check:** the cap is checked only when a talk starts, so a talk already under way can go over by at most one talk (about 20k, the 10-minute limit). That is acceptable; the platform also checks funds every minute.

## Verification
1. `npm test` in `functions/api`: all pass.
2. Deploy with `openkbs fn deploy api`, which runs migration 020 on the first request. Then check with psql: `select ai_module_caps from settings` shows `{"orb_voice": 300000}`.
3. API check as admin: `ai.usage` returns `caps.orb_voice = 300000`, and the Ops AI → Credits by feature tile shows 300000 against Orb voice. Check this with a quick agent-browser look, then `agent-browser close --all`.
4. API check: `assistant.voiceSession`, then `assistant.voiceEnd {seconds: 30}`. The audit detail shows `credits ≈ 525, estimated: true`. Delete the empty test conversation afterwards.
5. Commit `fix: Orb voice cost follows talk length; default 300,000 voice cap` with the Co-Authored-By line, then push.
6. Tell the user:
   - What has really been spent: 4,000 app credits so far, all estimated, from test sessions.
   - The true per-talk cost can only be confirmed from the studio **Usage** panel after real phone talks, because the relay doesn't report totals when a manager taps End.
   - Offer to recalibrate the curve once those numbers are in.
