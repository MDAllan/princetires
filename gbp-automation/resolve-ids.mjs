// One-time helper: prints your GBP account + location so you can set GBP_V4_PARENT in .env.
// Run once after adding credentials:  node resolve-ids.mjs

import 'dotenv/config';
import { getAccessToken } from './lib/auth.mjs';
import { getFirstAccount, listLocations, v4Path } from './lib/gbp.mjs';

const token = await getAccessToken();
const account = await getFirstAccount(token);
console.log('Account:', account);

const locations = await listLocations(token, account);
if (!locations.length) {
  console.log('No locations found on this account.');
  process.exit(0);
}

console.log('\nLocations:');
for (const loc of locations) {
  console.log(`  ${loc.title}  ->  GBP_V4_PARENT=${v4Path(account, loc.name)}`);
}
console.log('\nCopy the GBP_V4_PARENT value for "Prince Tires" into your .env file.');
