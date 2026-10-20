# Plan: Interactive Academy lessons (infographics, AI scene pictures, best-practice options)

## Context
Academy lessons are text only today. `Lesson` in `app/src/pages/learn/_parts.jsx:40` renders paragraphs, `###` headings, bullets and **bold**, followed by one quick check. The user wants courses that are more interactive and visual, with infographics, mock images, and best practice shown alongside the other options available.

Decisions from the user:
- **Visuals: both.** The app draws the infographics (no credits; always sharp and matching the text), and AI draws a scene picture for each section.
- **Interactive block: "Options: best / OK / poor".** The officer reads a situation, picks a response, and sees how each option rates and why.

Defaults I've assumed because the remaining questions came back unanswered (easy to change):
- Upgrade all 12 published courses: pilot one course first, report the credits used, then do the rest.
- Company managers can fully edit blocks in the course editor.

Non-goals:
- No changes to the quiz, certificates or Toolbox cards.
- No drag-and-drop or hotspot games.
- No text inside AI pictures. Labels are drawn by the app, because AI image text comes out garbled.

## Block types (stored per section, shown in this order around the lesson)
| type | data | shown as |
|---|---|---|
| `image` | `{key, prompt, caption, source: ai\|upload}` | Hero picture at the top of the section; tapping opens the existing Lightbox |
| `key_facts` | `{facts:[{value,label}]}` (2–4) | Infographic tiles, e.g. **999** "Call first", **30:2** "Compressions : breaths" |
| `steps` | `{title, steps:[]}` (3–7) | Numbered vertical flow with connecting line and arrows, blue tones |
| `dos_donts` | `{do:[], dont:[]}` (2–5 each) | Green ✓ Do and red ✗ Don't panels side by side; stacked on a phone |
| `options` | `{situation, choices:[{text, rating: best\|ok\|poor, why}]}` (3–4 choices) | "What would you do?" card. The officer taps a choice; every choice then shows a Best practice (green) / Acceptable (amber) / Poor (red) badge with the reason, and the best one is highlighted |

Placement order: image, then the lesson text, then key facts, steps, do/don't, options, then the quick check.
- The options block is for learning, not marking, so no answers are hidden and there's no API call.
- Ratings are randomised in order when the course is served.

## 1. Database: `functions/api/db/migrations/005_lesson_blocks.sql`
- `ALTER TABLE course_sections ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'`.

## 2. Backend
**`functions/api/lib/storage.mjs`**
- Add `putObject(key, bytes, contentType)`, using the same S3 client as `uploadUrl`.

**`functions/api/lib/ai.mjs`: add `drawImage({prompt, module})`**
- Calls `POST https://proxy.openkbs.com/v1/google/models/gemini-3-pro-image:generateContent` with `generationConfig.responseModalities:['IMAGE']` and a 16:9 aspect ratio.
- Returns the PNG bytes from `inlineData`.
- `checkCap(module)` runs first.
- Usage is logged to `ai_usage` from `usageMetadata`. If the proxy reports no tokens, a fixed per-image credit value is logged instead. That value is measured in step 6 (compare project credits before and after one image).
- Timeout is 50 s, and it throws a friendly `fail(502, 'The picture could not be drawn — try again')`.

**`functions/api/modules/academy.mjs`**
- **`BLOCK_FIELDS`:** string fields, one item per line, parsed with the existing `lines()` helper, because Sonnet tool calls break on arrays (lesson from v19 and v23):
  - `key_facts` as "value :: label"
  - `steps`
  - `dos` and `donts`
  - `options_situation`
  - `options` as "best|ok|poor :: response :: why"
  - `image_prompt` (a scene with no text or logos, no identifiable faces, UK venue, flat illustration style)
- **`cleanBlocks(raw)`:**
  - Validates types and lengths and caps items.
  - Requires at least one `best` and one `poor` choice when an options block exists.
  - Image keys must start with `docs/learn/`.
  - Used by `saveCourse` and by drafting.
- **`toBlocks(input)`:** converts the parsed tool fields into the block list. The image block's `prompt` is saved but has no `key` yet.
- **`academy.draftSection`:**
  - `SECTION_TOOL` gains the `BLOCK_FIELDS`.
  - `CONTENT_RULES` (`lib/learn.mjs:22`) gains: "Best practice options must reflect UK law and SIA guidance; poor options explain the legal or safety risk."
  - It keeps one `extract` per section and raises `max_tokens` by about 900.
- **New `academy.enrichSection {section_id}`** (company only, Sonnet, `module='academy'`):
  - Reads the existing body and writes only the blocks.
  - Body, quick check and questions stay untouched, so certificates and the quiz are unaffected.
  - Bumps the version when the course is published, as `draftSection` already does.
- **New `academy.drawImage {section_id, prompt?}`** (company only):
  - Draws the picture, writes it to `docs/learn/ai/<course>/<uuid>.png` with `putObject`, and sets or replaces the section's image block.
  - It is one call per picture, so it stays inside the 60 s Lambda limit.
- **`academy.course` and `academy.edit`:**
  - Return `blocks`, with each image signed through `downloadUrl` (the pattern from `everyday.mjs:59`).
  - Options choices are shuffled.
- **`saveCourse`:** accepts `sections[].blocks` through `cleanBlocks`.
- **`courseText()`:** appends blocks as plain text (facts, steps, do/don't, options with ratings) so the tutor can talk about them.

## 3. Frontend
**`app/src/pages/learn/_blocks.jsx` (new)**
- `Blocks({blocks})` renders each block type with existing tokens: `bg-green-soft`/`text-green`, `amber`, `red`, `blue-soft`, `rounded-tile`, and lucide icons.
- `HeroImage` uses `loading="lazy"`, a 16:9 box with `bg-[#EEF0F3]` while loading, and the caption.
  - Tapping opens `Lightbox` from `pages/everyday/_parts.jsx:101`.
- `OptionsBlock` keeps local `picked` state and resets when the section changes.
- Everything is mobile first (390 px) and stacks responsively.

**`app/src/pages/learn/Course.jsx`**
- In the section `Tile` (68–72), render the image above the `h2`, and the other blocks between `<Lesson>` and `<QuickCheck>`.

**`app/src/pages/team/CourseEditor.jsx`**
- Add a "Visuals & activities" `<details>` per section, built as a `BlocksEditor` in `_blocks.jsx`:
  - add, remove and reorder blocks;
  - type-specific fields that reuse `Input`, `Textarea` and the one-item-per-line pattern;
  - a rating select for each option.
- Image controls:
  - "Draw with AI" calls `academy.drawImage` with an editable prompt (save first, like `draftSection` at 94–112).
  - "Upload photo" uses `compressImage` and then `upload(file, 'learn')`; the purpose already exists.
  - "Remove".
- "Add visuals with AI" per section calls `enrichSection`.
- A course-level "Add visuals to all sections" runs section by section with a progress bar, like the starter library: blocks first, then the picture.
- `toBody` sends `blocks`.
- Security managers keep read-only access.

## 4. Upgrade the 12 published courses
1. **Pilot:** run First aid awareness through `/tmp/orb/call.mjs company academy.enrichSection` and then `academy.drawImage` for each section.
   - Check each section's facts and best/poor ratings against the lesson.
   - Check that each picture has no garbled text, no gore and no identifiable faces. Redraw any picture that fails.
2. Report the pilot's credits from `ai.usage`.
3. If the projection for all 12 courses stays well within the monthly budget (590k of 2M used so far), do the other 11 the same way. If not, stop and ask the user first.

## 5. Deploy
1. `cd app && npm run build`.
2. Commit as `feat: Academy lessons get pictures, infographics and best-practice options` with Co-Authored-By.
3. `openkbs fn deploy api --schedule "rate(5 minutes)" -t 60`.
4. `openkbs site deploy`.
5. The migration runs on the first call.
6. Add a plain-language comment to board card dmCG2Lk7.

## 6. Verification
1. **Cost measurement:** one `drawImage` call, then read credits before and after with `ai.usage` and the project balance. Set the per-image credit value.
2. **Officer view (`/tmp/login.sh officer_marcus`, 390 px and 1440 px), on an upgraded section:**
   - the hero picture loads and opens in the lightbox;
   - fact tiles, the step flow and the do/don't panels render without horizontal overflow;
   - the options card reveals all ratings with reasons after a tap;
   - the quick check still works;
   - the quiz and the existing certificates are unchanged.
3. **Manager view (company, 1440 px):**
   - edit a fact, reorder blocks, upload a photo, redraw a picture with AI, then save;
   - the changes show in Preview;
   - a security manager sees no edit controls.
4. **API:**
   - `saveCourse` rejects a block with an image key outside `docs/learn/`;
   - signed image URLs work and expire;
   - the tutor answers a question about the options card from the course text.
5. **Wrap-up:**
   - DB read-only check: every section of all 12 courses has blocks and an image.
   - Report the total credits used.
   - Run `agent-browser close --all`.
