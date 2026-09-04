// Fetches reviews and replies to any that don't have a reply yet.
// Skips reviews already replied to. DRY_RUN=1 logs what it would do without posting.
// Run daily via cron.

import 'dotenv/config';
import { getAccessToken } from './lib/auth.mjs';
import { listReviews, replyToReview } from './lib/gbp.mjs';
import { chooseReply } from './lib/replies.mjs';

const DRY = process.env.DRY_RUN === '1';
const PARENT = process.env.GBP_V4_PARENT; // accounts/{a}/locations/{l}
if (!PARENT) throw new Error('Set GBP_V4_PARENT in .env (run: node resolve-ids.mjs).');

const stamp = () => new Date().toISOString();
const log = (...a) => console.log(stamp(), ...a);

const token = await getAccessToken();
const reviews = await listReviews(token, PARENT);
log(`Fetched ${reviews.length} reviews. ${DRY ? '(DRY RUN)' : ''}`);

let replied = 0, skipped = 0, failed = 0;
for (const review of reviews) {
  if (review.reviewReply) { skipped++; continue; } // already has a reply
  const reply = chooseReply(review);
  const who = review.reviewer?.displayName || 'Anonymous';
  const stars = review.starRating || '?';
  if (DRY) {
    log(`WOULD REPLY [${stars}] ${who}: ${reply}`);
    replied++;
    continue;
  }
  try {
    await replyToReview(token, review.name, reply);
    log(`REPLIED [${stars}] ${who}`);
    replied++;
    await new Promise(r => setTimeout(r, 1200)); // be gentle on quota
  } catch (e) {
    log(`FAILED ${who}: ${e.message}`);
    failed++;
  }
}
log(`Done. replied=${replied} skipped=${skipped} failed=${failed}`);
