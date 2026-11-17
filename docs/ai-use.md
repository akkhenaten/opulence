# Where Orb uses AI, and where rules do the work

Rules first; the AI only when the rules can't tell. Each rule lives in a small pure module with its own tests
(`functions/api/test/aiRules.test.mjs`, `replyRules.test.mjs`).

| Job | Rules (no credits) | AI only when |
|---|---|---|
| Replies to Orb's shift messages (`messages.mjs` → `classifyReply`) | `lib/replyRules.mjs`: yes / no / on my way + minutes / signing now | the reply is long, asks something back or is mixed |
| Staff request typed in chat (`venueRequests.create`) | `lib/parseRequest.mjs`: one date or "every …", time range, count, role | a follow-up in a conversation, a change or cancel, or anything unsure |
| Venue feedback (`feedback.submit`) | `lib/feedbackRules.mjs`: ≤2 stars or a complaint word | a note over 200 characters with neither |
| Toolbox search (`toolbox.suggest`) | `lib/cardSearch.mjs`: word match on title, tags, summary, steps; emergency words | no card matches |
| Compliance advice (`runCompliance`) | `templateAdvice()` always | the manager taps "Ask Orb what to do first" (`compliance.explain`) |
| Incident evidence review (`evidenceScan`) | — | once per report; "Check again" runs it on request |
| Venue street line (`streetFromText`) | `streetByRule` | no number + street-name line found |
| Venue website text | the default line (`DEFAULT_BLURB`) | the manager taps write |

Still AI by design (judgement or writing): Orb's chat and voice, incident writing and review, cover proposals, academy
course writing, email drafts. The course tutor and email summaries use Haiku. `creditsFor` counts cache-read tokens at 10%.
