// node --env-file=<app>/.env.local pull-one.mjs <key> <outfile>   (GET only; main theme resolved by role)
import { mkdirSync, writeFileSync } from "node:fs"; import { dirname } from "node:path";
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN, S = process.env.SHOPIFY_STORE_DOMAIN, V = process.env.SHOPIFY_API_VERSION || "2026-04";
const H = { "X-Shopify-Access-Token": T };
const [key, out] = process.argv.slice(2);
const main = (await (await fetch(`https://${S}/admin/api/${V}/themes.json`, { headers: H })).json()).themes.find((t) => t.role === "main");
const r = await fetch(`https://${S}/admin/api/${V}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`, { headers: H });
if (!r.ok) { console.error(`${r.status} ${key}`); process.exit(1); }
const a = (await r.json()).asset; const body = a.value ?? Buffer.from(a.attachment, "base64").toString("utf8");
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, body); console.log(`pulled ${key} (${body.length}) theme ${main.id} updated ${a.updated_at}`);
