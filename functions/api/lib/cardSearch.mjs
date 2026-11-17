// "What should I do?" in the Toolbox: match the officer's words to published cards by plain word overlap, so most
// searches cost no AI. Title and tags weigh most, then the summary, then the steps. Pure, so it is tested directly.

const STOP = new Set('a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its just me my of on or our out she so some that the their them then there they this to too up us was we were what when where which who will with would you your someone somebody person guy man woman people there'.split(' '));

// Life at risk: the screen says call 999 first, whatever the cards say
const EMERGENCY = /\b(not breathing|stopped breathing|unconscious|unresponsive|collapsed|cardiac|heart attack|seizure|fitting|overdose|choking|stabbed|stabbing|knife|blade|gun|firearm|shot|weapon|acid|fire|smoke|bleeding heavily|serious(?:ly)? bleeding|lots of blood|head injury|hanging|suicid\w*|bomb|explosive|suspicious package)\b/i;

const stem = (w) => w.replace(/(?:ing|ed|es|s)$/, '');
const words = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);

export const isEmergency = (text) => EMERGENCY.test(String(text || ''));

/** Up to 3 cards whose words overlap the situation, best first, each with a short why. Empty when nothing fits. */
export function searchCards(text, cards) {
  const want = [...new Set(words(text))];
  if (!want.length) return [];
  const scored = cards.map((c) => {
    const fields = [[words(c.title), 3], [words((c.tags || []).join(' ')), 3], [words(c.summary), 2], [words((c.steps || []).join(' ')), 1]];
    let score = 0;
    for (const w of want) {
      const best = Math.max(0, ...fields.map(([f, wt]) => (f.includes(w) ? wt : 0)));
      score += best;
    }
    return { card: c, score };
  });
  // One weak word in the steps isn't a match: needs a title or tag word, or several words in the summary or steps
  return scored.filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score || a.card.title.localeCompare(b.card.title))
    .slice(0, 3)
    .map((s) => ({ card: s.card, why: s.card.summary ? String(s.card.summary).split(/(?<=[.!?])\s/)[0].slice(0, 140) : '' }));
}
