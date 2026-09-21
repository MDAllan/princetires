#!/usr/bin/env node
// Regenerate the storefront vehicle-fitment assets (assets/pt-vehicle-{year}.json)
// from the wheel-size.com API instead of the old externally-scraped data.
//
// WHY build-time (not live at runtime): the Year→Make→Model→Trim dropdown cascade
// is the highest-frequency storefront surface. Calling the API per interaction is
// what blew the quota and got the key suspended in July 2026. This materializes
// authoritative API data into the SAME static-asset shape the theme already reads
// (data.models[Make][Model][Trim] = [sizes]), so the runtime stays instant, costs
// zero quota, and still works if the API is ever down.
//
// The job is resumable: every API response is cached to disk keyed by URL, so a
// re-run (after a 429 stop, a crash, or to fill gaps) skips completed work and
// spends no quota on it. A per-year file is only written once that year is pulled
// in full — we never overwrite a good asset with a partial one.
//
// Usage (key comes from env; pass it in with the grep-export pattern):
//   export WHEEL_SIZE_API_KEY="$(grep -E '^WHEEL_SIZE_API_KEY=' ../princetires-app/.env.local | cut -d= -f2- | tr -d '\"')"
//   node scripts/regen-vehicle-fitment.mjs --years 2024 --make toyota --out .cache/vehicle-validate   # small validation
//   node scripts/regen-vehicle-fitment.mjs --years 2015-2026 --write-assets                            # real run (throttled, long)
//
// Flags:
//   --years 2024 | 2015-2026 | 2020,2021   year(s) to build (default 2015-2026)
//   --make toyota                          restrict to one make slug (validation)
//   --out <dir>                            output dir (default .cache/vehicle-validate)
//   --write-assets                         write to ./assets (the live files) instead of --out
//   --throttle 350                         ms between live API calls (default 350)
//   --limit 0                              max live API calls this run, 0 = unlimited
//   --region cdm                           wheel-size region (default cdm = Canada)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, ".."); // princetires theme root

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const KEY = process.env.WHEEL_SIZE_API_KEY;
if (!KEY) {
  console.error("WHEEL_SIZE_API_KEY not set. Export it first (see header).");
  process.exit(1);
}
const REGION = String(flag("region", "cdm"));
const THROTTLE_MS = Number(flag("throttle", 350));
const CALL_LIMIT = Number(flag("limit", 0)); // 0 = unlimited
const WRITE_ASSETS = argv.includes("--write-assets");
const OUT_DIR = WRITE_ASSETS ? join(REPO, "assets") : join(REPO, String(flag("out", ".cache/vehicle-validate")));
const ONE_MAKE = flag("make", null) ? String(flag("make", null)).toLowerCase() : null;
const CACHE_DIR = join(REPO, ".cache/wheel-size-raw");

function parseYears(spec) {
  const s = String(spec ?? "2015-2026");
  if (s.includes("-")) {
    const [a, b] = s.split("-").map(Number);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return s.split(",").map((x) => Number(x.trim())).filter(Boolean);
}
const YEARS_ARG = flag("years", null); // omit → auto-detect the API's full span

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });

// ── fetch with disk cache + throttle + 429 backoff ──────────────────────────
const V2 = "https://api.wheel-size.com/v2";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let liveCalls = 0;
let consecutive429 = 0;

function cachePath(url) {
  const h = createHash("sha1").update(url).digest("hex");
  return join(CACHE_DIR, `${h}.json`);
}

class QuotaExhausted extends Error {}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ ...params, region: REGION }).toString();
  const publicUrl = `${V2}/${path}?${qs}`; // cache key WITHOUT the key
  const cp = cachePath(publicUrl);
  if (existsSync(cp)) {
    try { return JSON.parse(readFileSync(cp, "utf8")); } catch { /* refetch */ }
  }
  if (CALL_LIMIT && liveCalls >= CALL_LIMIT) throw new QuotaExhausted(`--limit ${CALL_LIMIT} reached`);

  const url = `${publicUrl}&user_key=${encodeURIComponent(KEY)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(THROTTLE_MS);
    liveCalls++;
    let res;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (e) {
      console.warn(`   net error (${e.message}); retrying…`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status === 429) {
      consecutive429++;
      if (consecutive429 >= 8) throw new QuotaExhausted("8 consecutive 429s — daily quota looks spent");
      const wait = Math.min(60000, 5000 * 2 ** attempt);
      console.warn(`   429 usage limit — backing off ${Math.round(wait / 1000)}s (attempt ${attempt + 1})`);
      await sleep(wait);
      continue;
    }
    consecutive429 = 0;
    if (res.status === 400) return { data: [] }; // unknown vehicle / bad combo → empty
    if (!res.ok) {
      console.warn(`   HTTP ${res.status} for ${path} ${JSON.stringify(params)}`);
      return { data: [] };
    }
    const body = await res.json();
    writeFileSync(cp, JSON.stringify(body));
    return body;
  }
  return { data: [] };
}

// ── transform: by_model records → { Trim: [sizes] } ─────────────────────────
function sizesFromRecords(records) {
  const byTrim = new Map(); // trimName -> Set(size)
  for (const rec of records || []) {
    const wheels = Array.isArray(rec.wheels) ? rec.wheels : [];
    const stock = wheels.filter((w) => w.is_stock !== false);
    const use = stock.length ? stock : wheels;
    const sizes = new Set();
    for (const w of use) {
      let t = w?.front?.tire; // e.g. "235/45R18" (front = the reference size)
      if (!t || !/^\d/.test(t)) continue;
      t = t.replace(/Z(R\d)/i, "$1"); // "225/40ZR18" ≡ "225/40R18" — collapse the Z-speed dup
      sizes.add(t);
    }
    if (!sizes.size) continue;
    // Prefer clean marketing trim names; fall back to the engine/variant name.
    let trims = Array.isArray(rec.trim_levels) && rec.trim_levels.length
      ? rec.trim_levels
      : [rec.trim || rec.name || "Base"];
    trims = trims.map((t) => String(t).trim()).filter(Boolean);
    for (const trim of trims) {
      if (!byTrim.has(trim)) byTrim.set(trim, new Set());
      for (const s of sizes) byTrim.get(trim).add(s);
    }
  }
  // to plain object, sizes sorted by rim then width
  const rimOf = (s) => { const m = s.match(/R(\d+(?:\.\d+)?)/i); return m ? parseFloat(m[1]) : 0; };
  const widOf = (s) => { const m = s.match(/^(\d+)/); return m ? +m[1] : 0; };
  const out = {};
  for (const [trim, set] of byTrim) {
    out[trim] = [...set].sort((a, b) => rimOf(a) - rimOf(b) || widOf(a) - widOf(b));
  }
  return out;
}

// ── transform: by_model records → per-vehicle WHEEL specs (for the reverse index) ──
// Bolt pattern + hub bore + stock rim sizes. This feeds Phase 3 (rim spec → vehicles),
// which lets us build "compatible cars per rim" on Basic WITHOUT the Business `classified`
// endpoint. Mirrors the extraction in princetires-app wheel-fitment/route.ts normalize().
function wheelSpecFromRecords(records) {
  let boltPattern = null, pcd = null, studHoles = null, centerBore = null;
  const wheels = [];
  const seen = new Set();
  for (const rec of records || []) {
    const t = rec.technical || {};
    if (!boltPattern && t.bolt_pattern) boltPattern = t.bolt_pattern;
    if (pcd == null && typeof t.pcd === "number") pcd = t.pcd;
    if (studHoles == null && typeof t.stud_holes === "number") studHoles = t.stud_holes;
    if (!centerBore && t.centre_bore) centerBore = t.centre_bore; // API uses British "centre"
    for (const w of rec.wheels || []) {
      if (!w.is_stock) continue;
      const f = w.front;
      if (!f || typeof f.rim_diameter !== "number") continue;
      const key = `${f.rim_diameter}x${f.rim_width ?? "?"}x${f.rim_offset ?? "?"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      wheels.push({
        diameter: f.rim_diameter,
        width: typeof f.rim_width === "number" ? f.rim_width : null,
        offset: typeof f.rim_offset === "number" ? f.rim_offset : null,
      });
    }
  }
  if (!boltPattern && !wheels.length) return null;
  wheels.sort((a, b) => a.diameter - b.diameter);
  return { boltPattern, pcd, studHoles, centerBore, wheels };
}

// Auto-detect the API's real year span (probe `makes` per candidate year; keep the
// ones with ≥1 in-region make). Makes the range API-driven, not hardcoded.
async function detectYears() {
  console.log("Auto-detecting API year span (probing makes/ per year)…");
  const present = [];
  for (let y = 1985; y <= 2030; y++) {
    const r = await apiGet("makes/", { year: y });
    if ((r.data || []).filter((m) => (m.regions || []).includes(REGION)).length > 0) present.push(y);
  }
  console.log(`  detected: ${present[0]}–${present[present.length - 1]} (${present.length} years with data)`);
  return present;
}

// Rebuild pt-vehicle-manifest.json from whatever year files exist in OUT_DIR, so the
// storefront dropdown range is data-derived (auto-widens) — no manual min/max setting.
// Robust to partial/resumed runs (scans the dir, not just this run's years).
function writeManifest() {
  const yrs = readdirSync(OUT_DIR).map((f) => f.match(/^pt-vehicle-(\d{4})\.json$/)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);
  if (!yrs.length) return;
  writeFileSync(join(OUT_DIR, "pt-vehicle-manifest.json"), JSON.stringify({ region: REGION, minYear: yrs[0], maxYear: yrs[yrs.length - 1], years: yrs, generatedAt: new Date().toISOString() }));
  console.log(`  → manifest: ${yrs[0]}–${yrs[yrs.length - 1]} (${yrs.length} years)`);
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const YEARS = YEARS_ARG ? parseYears(YEARS_ARG) : await detectYears();
  console.log(`Regenerating ${YEARS[0]}–${YEARS[YEARS.length - 1]} | region=${REGION} | throttle=${THROTTLE_MS}ms | out=${OUT_DIR}${WRITE_ASSETS ? " (LIVE ASSETS)" : ""}${ONE_MAKE ? ` | make=${ONE_MAKE}` : ""}`);
  try {
    for (const year of YEARS) {
      console.log(`\n=== ${year} ===`);
      const makesResp = await apiGet("makes/", { year });
      let makes = (makesResp.data || []).filter((m) => (m.regions || []).includes(REGION));
      if (ONE_MAKE) makes = makes.filter((m) => m.slug === ONE_MAKE);

      const models = {};        // tire sizes → pt-vehicle-{year}.json (theme shape, unchanged)
      const wheelModels = {};   // wheel specs → fitment-wheels-{year}.json (reverse-index feed)
      const makeNames = [];
      for (const mk of makes) {
        const modelsResp = await apiGet("models/", { make: mk.slug, year });
        const list = (modelsResp.data || []).filter((m) => (m.regions || []).includes(REGION));
        const modelObj = {};
        const wheelObj = {};
        for (const md of list) {
          const bm = await apiGet("search/by_model/", { make: mk.slug, model: md.slug, year });
          const trims = sizesFromRecords(bm.data);
          if (Object.keys(trims).length) modelObj[md.name] = trims;
          const wspec = wheelSpecFromRecords(bm.data);
          if (wspec) wheelObj[md.name] = wspec;
        }
        if (Object.keys(modelObj).length) {
          models[mk.name] = modelObj;
          makeNames.push(mk.name);
        }
        if (Object.keys(wheelObj).length) wheelModels[mk.name] = wheelObj;
        process.stdout.write(`  ${mk.name}:${Object.keys(modelObj).length} `);
      }

      const payload = { year, makes: makeNames.sort((a, b) => a.localeCompare(b)), models };
      const outfile = join(OUT_DIR, `pt-vehicle-${year}.json`);
      writeFileSync(outfile, JSON.stringify(payload));
      // Wheel specs go to a SEPARATE file so the theme asset shape stays clean.
      const wheelfile = join(OUT_DIR, `fitment-wheels-${year}.json`);
      writeFileSync(wheelfile, JSON.stringify({ year, models: wheelModels }));
      const modelCount = Object.values(models).reduce((n, m) => n + Object.keys(m).length, 0);
      console.log(`\n  → wrote ${outfile}  (${makeNames.length} makes, ${modelCount} models) + ${wheelfile}`);
      writeManifest(); // keep the range manifest current after every completed year
    }
    console.log(`\nDone. Live API calls this run: ${liveCalls}.`);
  } catch (e) {
    if (e instanceof QuotaExhausted) {
      console.log(`\n⏸  Stopped: ${e.message}. Cache is preserved — re-run the SAME command later to resume (completed calls are skipped). Live calls this run: ${liveCalls}.`);
      process.exit(3);
    }
    throw e;
  }
})();
