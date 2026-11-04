# Spec: Talk to Orb — voice as well as typing

## Why
Managers are often on the move: walking a venue, at the door on a Saturday night, or driving between sites. Typing on a phone is slow there. They want to *say* "who can cover the Lantern Rooms tonight?" or "add a draft door shift there for Friday" and have Orb do it, the same way it does when they type. Orb already knows the app and can act. Voice is a new way in, not a new assistant.

## Who
- Company admin and security / ops manager: the same people who have Orb today, with the same permissions and the same rules on what runs straight away and what needs Confirm.
- Officers: not in scope.

## What exists today
- Orb panel (round button, bottom right) with a typing box, live progress lines, Done chips with Undo, and Confirm checklists.
- Nothing in the app records sound yet.
- The platform has speech-to-text and a live voice relay (speech in, speech out, with tool calls), both billed to project AI credits.

## What we're building — two ways to talk

### 1. Dictate (hold to talk)
- A **mic button** next to the Orb typing box, on phone and desktop.
- Tap (or hold) to speak. Orb shows a listening state with a level meter and a timer. Tap again, or let go, to stop. Clips can be up to 60 seconds.
- Your words appear **in the typing box**. You can fix a misheard name, then tap Send. From then on it is exactly a typed message: same answer on screen, same Done and Confirm behaviour. *(Assumed default)*
- Replies stay as text. Dictation is for asking only. *(Assumed default)*
- Names the app knows help transcription: venue names, officer names and security terms (SIA, door supervisor, steward, rota) are passed as hints.

### 2. Conversation mode (hands-free)
- A **"Talk"** button in the Orb panel header opens a full-panel voice view: a large animated Orb mark that shows listening, thinking and speaking, a live caption of both sides, and **Mute** and **End** buttons.
- Orb listens and **answers out loud**, in short spoken sentences. You can interrupt it just by talking.
- It uses the same knowledge and the same actions as typed Orb: the user guide, look-ups, auto actions and Confirm cards. It acts as the signed-in manager with their permissions.
- While it works, it says so ("Let me check the rota…"), and the same progress lines show on screen.
- Done items appear on screen as Done chips with Undo, and Orb says what it did ("Done, the draft shift is on the rota").
- **Confirm cards by voice:**
  - Orb reads the card aloud in plain words ("Two changes: add venue Orb Test, and publish 6 shifts for next week. Shall I go ahead?").
  - Saying "yes, go ahead" approves it, or the manager can tap Confirm on screen. "No" or "cancel" cancels it.
  - **Money (pay and invoices) and anything sent to people** (messages, feed posts, documents to sign, published rota, emails, invites) are read aloud but **need a tap**. Orb says: "That one needs your tap on Confirm."
  - Unticking single lines is done on screen.
- The conversation is saved as a normal Orb chat: the transcript plus the Done and Confirm items, so it shows in previous chats and can be carried on by typing.
- Orb never reads out ids, links, passwords or long lists. It summarises and says "I've put the full list on screen."
- Ends automatically after 2 minutes of silence, and always after 10 minutes. Orb says so first.
- If the microphone is blocked or the connection drops, a clear message appears with how to fix it, and you can carry on typing.

### Language and voice
- British English, using one calm, clear voice for everyone.

## Cost and control *(assumed defaults)*
- Dictation is cheap: a few credits per clip. Conversation mode costs more, so it has its own **"Orb voice" monthly credit limit** in Ops AI settings, next to the Orb limit.
- When the limit is reached, voice switches off with a message, and typing still works.
- The company admin can **turn voice off** for everyone with one switch in Ops AI settings.
- Usage shows in the existing AI usage figures.

## Safety
- Voice is never a shortcut around the rules. The same permission checks, the same Confirm tiers and the same audit log apply ("via Orb, by voice").
- A spoken "yes" only approves what the card says, and never money or anything sent to people.
- Nothing is recorded or stored except the text transcript of the chat. Audio is not kept.
- The microphone is only on while the mic or Talk button is active, with a visible indicator. Leaving the page or closing Orb stops it.
- As with typed Orb, instructions spoken into notes or found in data are ignored.

## Non-goals
- Officers using voice (for example dictating incident reports). Possible later, but kept reusable.
- Wake words ("Hey Orb"), calling Orb by phone, or voice in the native phone app.
- Languages other than English.
- Voice notes in Messages.

## Edge cases
- **Noisy venue:** dictation lets you check the words first. Conversation mode lets you mute, and Orb asks again when it is unsure ("Did you say Lantern Rooms?").
- **Two people with the same name:** Orb asks which one, as it does in text.
- **A spoken Confirm when the card has a money line:** Orb runs nothing until the tap.
- **Phone locks or the app goes to the background:** the conversation ends cleanly, and the chat so far is saved.
- **Desktop with no microphone:** the mic and Talk buttons explain why they are unavailable.
- **Credits run out mid-conversation:** Orb says so and ends, and anything already done stays done.

## Done when
- A manager can dictate a question on phone and desktop, fix the text, and send it.
- A manager can hold a spoken conversation that:
  - answers a how-to question;
  - looks something up;
  - does an auto action with Undo on screen;
  - approves a non-money Confirm card by saying "yes";
  - refuses to approve a pay card without a tap.
- A security manager without pay access is refused pay topics by voice, just as in text.
- The voice switch and the voice credit limit work. The audit log shows voice actions.
- It works in Classic and Control Room, at 390px and on desktop.
