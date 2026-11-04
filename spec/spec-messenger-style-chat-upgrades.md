# Spec: Messenger-style chat upgrades

## Context
We compared the app with Facebook. The Everyday feed, reactions, comments, @mentions, photos, group chats, the notification bell, push notifications and notification settings all exist already. The biggest gap is **chat**. Messages arrive by refreshing every 10 seconds. There are no reactions on messages and no reply-to. "Seen" is tracked but never shown. There are no typing indicators, no voice notes, no pinned messages or search, and no @mentions in group chats. Officers already use WhatsApp-style apps, so our chat feels slow and basic next to them, and important instructions get lost.

You chose **Chat upgrades** as the area and **turning on realtime**. The other choices use the defaults:
- Staff only.
- Seen is visible to everyone in the chat.
- All four extras are in.
- Managers get "Must confirm" messages.

Groups and events, recognition and celebrations, and the feed extras are listed at the end as later candidates.

## Goals
- Chat feels instant: messages, typing and "Seen" appear without waiting.
- Officers can react, reply to a specific message, and send voice notes from the door.
- Important information stays findable: pinned messages, search, and "Must confirm" with a list of who hasn't confirmed.

## Who
Officers, security managers and company managers. Venue users don't have chat today, and that stays the same. All conversation kinds get the upgrades: direct, group, shift, cover and pay chats. The Orb Ops bot chat gets reactions and search, but no typing or Seen from the bot.

## Functional requirements

### 1. Realtime
- Turn on the platform realtime service. A new message, edit, delete, reaction, typing state or Seen update reaches open chats and the Messages list in about a second.
- If the connection drops, the app falls back to today's polling, so nothing is lost. When the app reconnects, it fetches anything it missed.
- Each person only receives events for conversations they belong to. A manager's safeguarding view stays read-only and doesn't create typing or Seen signals.

### 2. Seen receipts
- **1:1 chats:** your last message shows "Sent", then "Seen 21:04".
- **Group chats:** your message shows "Seen by 4". Tap it to see who has seen it and when.
- This uses the existing "last read" data. Opening a chat marks it seen.

### 3. Typing indicator
- Shows "Sam is typing…" in the chat, or "Sam and 2 others…" in a group. It disappears after 5 seconds with no typing.

### 4. Reactions on messages
- Long-press or hover a message to react. The six emojis are the same as Everyday: 👍 ❤️ 😂 😮 😢 👏.
- Each person has one reaction per message, and can change or remove it.
- Counts show under the message, and tapping them shows who reacted.
- The author gets one push per message per day at most. Reactions never push in muted chats.

### 5. Reply-to (quote)
- Swipe or choose "Reply" to quote a message. A small preview of the original appears above the new one, and tapping it jumps to the original.
- If the original is deleted, the preview shows "Message deleted".

### 6. Voice notes
- Hold the mic button to record, up to 2 minutes. Slide away to cancel.
- Voice notes play inline with a play/pause control and their length.
- An AI transcript appears under each voice note, collapsed by default. It also makes voice notes searchable.
- Voice notes are stored like other attachments and follow the same access rules.

### 7. @mentions in groups
- Typing @ in a group, shift or cover chat opens a picker of that chat's members, the same as in Everyday.
- The person mentioned gets a notification even if they have muted the group. They can turn off mention notifications in their notification settings, like other social notices.

### 8. Pinned messages
- Managers can pin up to 3 messages per chat in any chat they're in. The person who created a group can also pin in that group.
- Pinned messages show in a bar at the top of the chat. Tapping the bar jumps to the message.
- Unpinning is allowed for the same people.

### 9. Search
- **In a chat:** search the text and voice transcripts and jump to the results.
- **Across all chats:** a search box on the Messages page shows matching messages grouped by chat.
- Results only come from chats the person belongs to, and only from after they joined.

### 10. "Must confirm" messages (managers)
- A manager can switch on "Must confirm" when sending in any chat. Recipients see a **Got it** button.
- The message stays highlighted, and is automatically pinned, until they confirm.
- The manager sees "Confirmed 6/9" and a list of who is outstanding, with a **Chase** button that sends a push to those people only.
- Confirmations are recorded with a timestamp and kept for audit.

## Acceptance criteria
- Two people in a chat on different devices each see the other's message within about 2 seconds, without refreshing. If the connection is cut, messages still arrive within the polling interval.
- A 1:1 message shows "Seen" once the other person opens the chat. A group message shows the right "Seen by" count and list.
- Typing shows on the other device and clears 5 seconds after typing stops.
- Reacting, replying, recording a voice note, pinning, searching and @mentioning all work on phone and desktop.
- A voice note under 2 minutes plays back, and its transcript appears and can be searched.
- A mention in a muted group still notifies the person mentioned.
- A "Must confirm" message lists who is outstanding, Chase pushes only them, and the count updates live as people tap Got it.
- Nobody sees events, search results or receipts for chats they aren't in.

## Constraints
- Staff only. Venue users are not affected.
- Existing rules stay as they are: editing within 15 minutes, soft delete, reporting, the manager safeguarding view with its audit log, muting, and the Orb Ops quick-reply buttons.
- Voice transcripts use the existing AI proxy. A failed transcript never blocks the voice note.

## Assumptions (defaults chosen)
- Seen receipts can't be turned off.
- The pin limit is 3 per chat.
- Voice notes can be up to 2 minutes.

## Out of scope (candidates for later specs)
- **Groups and events:** communities with their own feed, and events with RSVP.
- **Recognition and celebrations:** kudos, badges, birthdays, anniversaries and milestones.
- **Feed extras:** polls, video, stories, saved posts, memories, hashtags, sharing, people and post search, and richer profiles.
- Voice and video calls, disappearing messages, forwarding, stickers and GIFs.
