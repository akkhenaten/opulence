# Implementation plan: Interactive Academy lessons

## Context
The spec is `spec/plan-interactive-academy-lessons-infographics-ai-scene-pictu.md` (approved). Each Academy lesson section gets:
- an AI scene picture;
- app-drawn infographics: key-fact tiles, a step flow and Do/Don't panels;
- a "What would you do?" card where each option is rated best, acceptable or poor, with the reason.

Company managers can edit all of it. All 12 published courses get upgraded: one course as a pilot first, with a credit report, then the rest. The quiz, the certificates and the Toolbox don't change.

## 1. Data: `functions/api/db/migrations/005_lesson_blocks.sql`
```sql
ALTER TABLE course_sections ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]';
```
- **Block shapes:**
  - `{type:'image', key, prompt, caption, source:'ai'|'upload'}`
  - `{type:'key_facts', facts:[{value,label}]}`
  - `{type:'steps', title, steps:[]}`
  - `{type:'dos_donts', do:[], dont:[]}`
  - `{type:'options', situation, choices:[{text, rating:'best'|'ok'|'poor', why}]}`
- **Limits:**
  - one block of each type per section;
  - 2–4 facts, 3–7 steps, 2–5 Do and 2–5 Don't items, 3–4 choices;
  - text is trimmed and length-capped.

## 2. Backend
**`lib/storage.mjs`**
- Add `putObject(key, bytes, contentType)` using `PutObjectCommand`, which is already imported.

**`lib/ai.mjs`**
- Extract the usage upsert at lines 83–85 into `logUsage(module, credits)` and reuse it in `claude()`.
- Add `drawImage({prompt, module='academy'})`:
  - Calls `checkCap(module)`.
  - POSTs to `https://proxy.openkbs.com/v1/google/models/gemini-3-pro-image:generateContent` with `Authorization: Bearer OPENKBS_API_KEY`. The body is `{contents:[{role:'user',parts:[{text}]}], generationConfig:{responseModalities:['IMAGE'], imageConfig:{aspectRatio:'16:9'}}}`.
  - The request uses an `AbortSignal.timeout(50000)`.
  - Returns `{bytes, mime, credits}`, with the bytes from `candidates[0].content.parts[].inlineData`.
  - Credits come from `usageMetadata` priced with `priceFor`. If that comes out as 0, use `IMAGE_CREDITS` instead, a constant measured in step 6.
  - Any failure becomes `fail(502, 'The picture could not be drawn — try again')`.
- `IMAGE_STYLE` is a fixed prompt suffix:
  - flat editorial illustration, UK venue setting, calm colours;
  - no text, letters, signs or logos;
  - no identifiable faces, no blood or injuries shown;
  - mixed ages and backgrounds.

**`lib/learn.mjs`**
- Add one line to `CONTENT_RULES`: best-practice options must follow UK law and SIA guidance; poor options must explain the legal or safety risk; acceptable means safe but not ideal.

**`modules/academy.mjs`**
- **`BLOCK_FIELDS`** are string properties, one item per line, because array fields break in tool calls:
  - `key_facts` as "value :: label"
  - `steps_title` and `steps`
  - `dos` and `donts`
  - `options_situation`
  - `options` as "best|ok|poor :: response :: why"
  - `image_prompt` and `image_caption`
- **`toBlocks(input, keepImage)`** parses the fields with the existing `lines()` helper and splits on `::`. It keeps the current image block when the section already has a picture, and updates its prompt.
- **`cleanBlocks(raw, courseId)`:**
  - checks the type whitelist, the limits and the trimming;
  - an options block needs at least one `best` and one `poor` choice, otherwise it's dropped;
  - an image key must match `^docs/learn/`, otherwise it fails with a 400.
- **`SECTION_TOOL`** gains `BLOCK_FIELDS`, and `draftSection` sets `max_tokens` to 3500 and saves `blocks`.
- **New `academy.enrichSection {section_id}`** (company only):
  - `extract` with SONNET and `module='academy'`, using a tool made only of the `BLOCK_FIELDS`.
  - The system prompt is `CONTENT_RULES` plus the course title, the section title and the existing body. It is told to add only what the lesson already says.
  - It updates only `blocks` and bumps `courses.version` when the course is published.
  - It returns `{blocks, credits}`.
- **New `academy.drawImage {section_id, prompt?}`** (company only):
  - The prompt comes from the argument, or the stored image prompt, or the section title.
  - It calls `drawImage`, then `putObject('docs/learn/ai/<course8>/<uuid>.png')`, then puts the image block first in `blocks`.
  - It returns `{blocks (signed), credits}`.
- **`signBlocks(blocks)`** adds `url: await downloadUrl(key)` to the image block.
  - Used by `academy.course` (219–234), `academy.edit` and the two new actions.
  - The officer response shuffles `options.choices`.
- **`saveCourse`** (140–196) writes `blocks: cleanBlocks(s.blocks)` in the section upsert, stripping `url`.
- **`courseText()`** (135–138) appends the blocks as text (facts, steps, Do/Don't, and the options with their ratings and reasons) for the tutor.
- Register both new actions with `def(['company'], …)`.

## 3. Frontend
**`app/src/pages/learn/_blocks.jsx` (new)**
- **`HeroImage({block, onOpen})`:**
  - a 16:9 `rounded-tile` box with a grey placeholder and `loading="lazy"`;
  - the caption sits below it in `text-muted`;
  - tapping opens `Lightbox` from `pages/everyday/_parts.jsx:101`.
- **`KeyFacts`:** a grid of 2–4 tiles (2 columns on a phone, 4 on desktop) with a big `font-display` value in blue and the label below.
- **`StepFlow`:** numbered circles joined by a vertical line, with a `bg-blue-soft` card for each step.
- **`DosDonts`:** two panels, `bg-green-soft` with a `Check` icon and `bg-red-soft` with an `X` icon. They stack on a phone and sit side by side from `sm` up.
- **`OptionsCard`:**
  - shows the situation and the choices as buttons;
  - once the officer picks, every choice shows its badge (Best practice green, Acceptable amber, Poor red) and the reason;
  - the picked choice gets a ring, and the state resets when the section changes (keyed by section id).
- **`Blocks({blocks})`** renders the non-image blocks in a fixed order.
- **`BlocksEditor({sec, onChange, onDraw, onEnrich, busy})`** for the manager editor:
  - one-item-per-line textareas, like the existing hints;
  - an options editor with a rating `Select` for each choice;
  - add and remove for each type.
  - Image actions:
    - "Draw with AI", which runs `academy.drawImage` from an editable prompt;
    - "Upload photo", which runs `compressImage` (`officer/_parts.jsx:8`) and then `upload(file, 'learn')` to set the image key;
    - "Remove".

**`learn/Course.jsx`:** in the section Tile (68–72), render `HeroImage` above the `h2`, and `<Blocks>` between `<Lesson>` and `<QuickCheck>`.

**`team/CourseEditor.jsx`**
- Each section gets a "Visuals & activities" `<details>` holding the `BlocksEditor` (company only; read-only otherwise).
- "Add visuals with AI" saves first if the course is dirty (reusing the pattern from `draftSection` at 94–112), then calls `enrichSection`.
- A course-level "Add visuals to all sections" runs `enrichSection` and then `drawImage` for each section, with a progress bar. It skips sections that already have both.
- `toBody` (25–37) includes `blocks`, and `toState` keeps it.

## 4. Content upgrade (after deploy)
- Run `/tmp/orb/visuals.mjs <course_id>`, a driver built like `academy.mjs`. For each section it calls `enrichSection` and then `drawImage`, and prints the credits for each call.
- **Pilot: First aid awareness.**
  - Review every section: the facts match the lesson, the best and poor ratings are sound, and the steps follow Resuscitation Council UK guidance.
  - View each picture: no garbled text, no gore, no identifiable faces. Redraw any failures with an adjusted prompt.
- Report the pilot's credits, then project the cost of all 12 courses.
  - If the projected total for the month stays under the 2M budget with headroom, do the other 11 the same way.
  - Otherwise stop and ask the user.

## 5. Deploy
1. `cd app && npm run build`.
2. `git commit` with the message `feat: Academy lessons get pictures, infographics and best-practice options`, then bullets, then Co-Authored-By.
3. `openkbs fn deploy api --schedule "rate(5 minutes)" -t 60`.
4. `openkbs site deploy`. The migration runs on the first call.
5. Comment on board card dmCG2Lk7 in plain business language.

## 6. Verification
1. **Image cost:**
   - Run one `drawImage` through `/tmp/orb/call.mjs`.
   - Check the logged credits against the `ai.usage` delta. If the proxy reports none, compare the project balance to set `IMAGE_CREDITS`.
   - Download the picture and view it.
2. **API checks:**
   - `academy.save` with an image key of `docs/feed/...` returns 400.
   - An options block with no `best` choice is dropped.
   - The signed URL loads.
   - The tutor answers "which option was best in the drunk-customer scenario?" from the course text.
3. **Officer** (`/tmp/login.sh officer_marcus`) at 390 px and 1440 px:
   - the hero image, the lightbox, the fact tiles, the step flow and Do/Don't all show, with no horizontal overflow;
   - the options card reveals the ratings;
   - the quick check, the quiz and the existing certificates are unchanged.
4. **Company manager:**
   - edit a fact, upload a photo, redraw a picture, then save; Preview shows the changes;
   - "Add visuals to all sections" shows progress;
   - a security manager sees no edit controls.
5. **Wrap-up:**
   - A read-only DB check confirms every section of the 12 courses has blocks and an image.
   - Report the total credits.
   - Run `agent-browser close --all`.
