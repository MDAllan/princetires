// Publishes the next un-posted item from data/posts.json to GBP.
// Tracks what's been posted in state/posted.json so each runs once.
// DRY_RUN=1 logs what it would post. Run weekly via cron.

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getAccessToken } from './lib/auth.mjs';
import { createLocalPost } from './lib/gbp.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DRY = process.env.DRY_RUN === '1';
const PARENT = process.env.GBP_V4_PARENT;
if (!PARENT) throw new Error('Set GBP_V4_PARENT in .env (run: node resolve-ids.mjs).');

const stamp = () => new Date().toISOString();
const log = (...a) => console.log(stamp(), ...a);

const posts = JSON.parse(readFileSync(join(__dir, 'data/posts.json'), 'utf8'));
const stateDir = join(__dir, 'state');
const statePath = join(stateDir, 'posted.json');
const posted = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : [];

const next = posts.find(p => !posted.includes(p.id));
if (!next) { log('No un-posted items left. Add more to data/posts.json or refresh the queue.'); process.exit(0); }

const body = {
  languageCode: 'en-US',
  summary: next.summary,
  topicType: next.topicType || 'STANDARD',
};
// CALL actions take no url; others link out.
if (next.cta?.actionType === 'CALL') {
  body.callToAction = { actionType: 'CALL' };
} else if (next.cta?.url) {
  body.callToAction = { actionType: next.cta.actionType, url: next.cta.url };
}
if (next.imageUrl) {
  body.media = [{ mediaFormat: 'PHOTO', sourceUrl: next.imageUrl }];
}

if (DRY) {
  log(`WOULD POST ${next.id}:`, JSON.stringify(body, null, 2));
  process.exit(0);
}

const token = await getAccessToken();
await createLocalPost(token, PARENT, body);
posted.push(next.id);
mkdirSync(stateDir, { recursive: true });
writeFileSync(statePath, JSON.stringify(posted, null, 2));
log(`POSTED ${next.id}. (${posted.length}/${posts.length} of the queue used.)`);
