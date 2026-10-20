# Spec: Orb Academy (Training), Officer Toolbox and Everyday feed

## Context
Orb Security already runs the operations side of a UK manned-security company: rota, clock-in, incidents, pay, compliance and Ops AI. Officers still learn their job, their legal powers and first aid outside Orb, and there is nowhere for the team to talk informally. You asked for three new, separate modules:
1. **AI training with quizzes** covering manned security, first aid guidelines and UK law, so officers do the job better and understand their rights and responsibilities.
2. **Officer Toolbox**, revision-style guidance cards with more detail, for first aid and common situations: what to do, step by step.
3. **Everyday**, a Facebook-style feed for the team.

You also asked for your requests to be organised into a proper format; this document is that.

### Decisions so far
- **Everyday v1:** posts, photos, reactions and comments (with @mentions and notifications). Groups, private messages, events, polls and stories come later.
- **Assumed (recommended defaults — say if you want them changed):**
  - Everyday is for staff of one company only: officers plus company and security managers. Venue clients can't see it.
  - Training and Toolbox content is drafted by AI from recognised UK sources and published only after a company manager approves it. Each item has a review date.
  - Managers can assign courses with due dates and track progress. Passing adds a dated in-house certificate to the officer's profile, and overdue mandatory training shows up on the existing Ops AI compliance cards.

## Where it sits in Orb
- **Officer app:** a new **Learn** tab replaces nothing. The bottom bar becomes Home · Shifts · Clock · Learn · Me, with Pay moving under Me. Learn holds Academy and Toolbox. Everyday gets a feed icon in the header with an unread badge, plus a "latest from Everyday" strip on Home.
- **Company / security manager portal:** a new **Team** group in the sidebar containing Academy (manage, assign, results), Toolbox (manage cards) and Everyday (feed plus moderation).
- **Venue portal:** no change.
- **Settings:** each module can be switched on or off per company (Academy, Toolbox, Everyday).

## 1. Orb Academy (training with quizzes)
**Officer**
- Course catalogue grouped by topic, for example:
  - **Role and law:** the SIA and licensing, powers of arrest (s24A PACE), use of force (s3 Criminal Law Act, common law self-defence), searching with consent, Equality Act, data protection and body-worn video, the Licensing Act 2003 and refusing entry or ejecting people.
  - **Operations:** conflict management, dealing with drugs and weapons, vulnerable people and Ask for Angela, crowd safety, Martyn's Law and counter-terrorism awareness (ACT), report writing and evidence.
  - **First aid:** primary survey, CPR and defibrillator, recovery position, bleeding, choking, seizures, overdose, head injury and spiking. Content is awareness-level and states that it doesn't replace a certified first aid course.
- **Lessons:** short sections (text plus images), each followed by a quick check.
- **End-of-course quiz:**
  - Multiple choice and scenario questions drawn from a bank, so each attempt is different.
  - Pass mark set per course (default 80%).
  - Retakes allowed after a cool-down.
- **After each answer**, the officer sees why it was right or wrong, with a link to the relevant lesson section.
- **"Ask the tutor":** AI chat inside a course. It answers from that course's approved content only and says when something is outside it.
- **Progress:** courses can be resumed, scores and certificates appear on the officer's profile, and the app reminds them about assigned courses that are due.

**Manager**
- **Course builder:**
  - Pick a topic. AI drafts the lessons and a question bank, citing its sources.
  - The manager edits and approves, then publishes.
  - Nothing reaches officers unpublished.
  - Each course has a "review by" date, and Ops AI reminds the manager when it is due.
- **Assigning:** assign to everyone, a role, a venue team or named officers, with due dates. Courses can be marked mandatory, with a renewal period (for example yearly).
- **Results:** a completion and score matrix per officer and per course, and the questions most often answered wrong. CSV export.
- **Compliance link:** overdue or lapsed mandatory training becomes an issue on the officer's existing compliance card, using the existing remind action.

## 2. Officer Toolbox (guidance cards)
- **Card categories:** first aid, common situations, law at a glance and venue procedures.
  - **Common situations** include refusal at the door, an intoxicated customer, someone found with drugs or a weapon, a lost or vulnerable person, a fight, a fire alarm or evacuation, a suspicious item, a complaint against the officer, and police arrival.
- **Card structure:**
  - Front: a one-line summary.
  - Body: what to do in numbered steps, what not to do, the law that applies, what to write in the incident report, and when to call 999 or a manager.
- **Finding cards:** officers can search, favourite cards, and use them offline (cached on the phone, since doors and basements often have no signal). Each card links to the related Academy course and has a "Report an incident" shortcut.
- **"Revise" mode:** flip through cards like flashcards, with an optional self-test.
- **"What should I do?":** the officer describes a situation and AI points to the matching cards. It never improvises medical or legal steps beyond the published cards.
- **Managers:** create or edit cards (AI drafts, a manager approves) and add venue-specific cards visible only to that venue's team.
- Approval, sources and review dates work the same way as in Academy.

## 3. Everyday (team feed) — v1
- **Posts:** text with up to 10 photos, plus @mentions of colleagues.
- **Reactions:** like, love, laugh, wow, sad and clap, showing who reacted.
- **Comments:** threaded one level deep, with their own reactions and mentions.
- **Feed:** newest first, with company announcements pinned at the top (managers can pin posts). Officers can edit or delete their own posts.
- **Notifications:** in-app and on the phone for mentions, comments on your post and reactions (grouped), with per-type settings.
- **Profiles:** tapping a name shows a simple profile card (photo, role, start year) and their posts.
- **Moderation:**
  - Anyone can report a post or comment.
  - Managers can hide, delete or mute a member.
  - AI pre-checks each post and photo for abuse, and for incident details, customers' faces or personal data that shouldn't be shared. It warns the poster before publishing and flags anything serious for managers.
  - Community rules are shown when someone posts for the first time.
- **Data:** the feed belongs to the company. Leavers lose access, and their posts stay up unless they are deleted.
- **Later (not in v1):** groups and pages, private messages and group chat, events, polls, stories, shares and video.

## Non-goals
- Training does not give official SIA qualifications or first aid certification. Certificates are in-house records only.
- No open network across companies.
- No paid course marketplace.
- No video hosting in v1 (lessons use text and images).

## Money and AI credits
- **One-off:** drafting a course or a set of cards uses AI credits once, at the point it's drafted.
- **Ongoing AI use:** "Ask the tutor", "What should I do?" and moderation checks use credits on each use. All of it counts towards the existing Ops AI monthly credit cap, which can be split per module in settings.
- Quizzes, toolbox reading and the feed itself cost nothing per use.

## Build order (proposed)
1. **Navigation reorganisation** plus **Toolbox**: the smallest build, immediately useful, and offline-ready.
2. **Academy**: courses, quizzes, assigning, certificates and the compliance link.
3. **Everyday v1**.
Each phase ships and is checked separately.

## Verification (for each phase)
- Run the full flow live as each role (officer at 390 px, manager at 1440 px), using the existing test logins.
- **Toolbox:** cards work offline, search finds the right card, and unpublished cards are invisible to officers.
- **Academy:** an AI-drafted course needs approval before it shows. A quiz pass issues a certificate and a fail allows a retake after the cool-down. An overdue mandatory course appears on the compliance card.
- **Everyday:** post with photos, react, comment and @mention, and check the notification arrives. A reported post can be hidden by a manager, the AI warns before a photo showing a customer's face is posted, and venue users can't reach the feed.
- Report the credits used for each phase.
