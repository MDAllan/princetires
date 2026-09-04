// Chooses a natural, varied reply for a review.
// - 1-3 star -> apologetic "negative" pool, routed to a phone call.
// - 4-5 star -> pick a category by keywords in the review text, else "general"
//   (or "stars_only" when the reviewer left no comment).
// Rotation is deterministic per review (hash of reviewId) so re-runs are stable.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const BANK = JSON.parse(readFileSync(join(__dir, '../data/replies.json'), 'utf8'));

const STAR_NUM = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

// Word boundaries (\b) matter: without them "price" matches "ice", "breakfast" matches "fast", etc.
const KEYWORDS = [
  ['winter', /\b(winter|snow|ice|studded|all.?weather|3pmsf|seasonal tires?)\b/i],
  ['swap',   /\b(swap|changeover|change ?over|switch)\b/i],
  ['flat',   /\b(flat|puncture|nail|leak|patch)\b/i],
  ['wheels', /\b(wheels?|rims?|alloys?)\b/i],
  ['truck',  /\b(truck|suv|f-?150|silverado|ram|dually|fleet)\b/i],
  ['price',  /\b(price|cheap|afford(able)?|deal|fair|cost|quote|value)\b/i],
  ['fast',   /\b(fast|quick(ly)?|hour|same.?day|speedy)\b/i],
  ['referral', /\b(recommend(ed)?|referr(al|ed)|friend|told me)\b/i],
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function pick(pool, seed) {
  return pool[seed % pool.length];
}

export function chooseReply(review) {
  const stars = STAR_NUM[review.starRating] || 5;
  const text = (review.comment || '').trim();
  const seed = hash(review.reviewId || review.name || text);

  let category;
  if (stars <= 3) {
    category = 'negative';
  } else if (!text) {
    category = 'stars_only';
  } else {
    category = 'general';
    for (const [name, re] of KEYWORDS) {
      if (re.test(text)) { category = name; break; }
    }
  }

  const firstName = (review.reviewer?.displayName || '').trim().split(/\s+/)[0] || 'there';
  return pick(BANK[category], seed).replaceAll('{name}', firstName);
}
