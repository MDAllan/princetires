#!/usr/bin/env node
// Phase 3 — build "compatible cars per rim" by INVERTING the fitment data we pulled
// (fitment-wheels-{year}.json), instead of the Business-only `classified` endpoint.
//
// For each rim product (its custom.* specs) we find vehicles that physically take it:
//   1) bolt pattern matches (count + PCD)
//   2) hub bore fits: rim center-bore >= vehicle hub bore (equal = exact, larger = ring)
//   3) the vehicle has an OE wheel at the rim's diameter, and
//   4) the rim's width/offset are within a sane tolerance of that vehicle's OE range
//
// Reads local wheel data + the live Shopify rim catalog (READ-only). Prints a preview.
// Pass --write to store results into custom.compatible_vehicles (guarded, later step).
//
//   export SHOPIFY_STORE_DOMAIN=... SHOPIFY_ADMIN_ACCESS_TOKEN=... SHOPIFY_API_VERSION=...
//   node scripts/build-rim-compatibility.mjs [--data .cache/vehicle-2015-2026] [--write]

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const argv = process.argv.slice(2);
const flagVal = (n, d) => { const i = argv.indexOf(`--${n}`); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const DATA_DIR = join(REPO, flagVal("data", ".cache/vehicle-2015-2026"));
const WRITE = argv.includes("--write");

// ── matcher helpers ──────────────────────────────────────────────────────────
// A vehicle has ONE bolt pattern; a rim may list SEVERAL (e.g. "6x135/139.7" fits
// both Ford 6x135 and GM/Toyota 6x139.7). parseBP → single; parseBPList → array.
const parseBP = (s) => { const m = String(s || "").match(/(\d+)\s*[x\-]\s*([\d.]+)/i); return m ? { count: +m[1], pcd: parseFloat(m[2]) } : null; };
function parseBPList(s) {
  const parts = String(s || "").trim().split("/").map((x) => x.trim()).filter(Boolean);
  const out = []; let lastCount = null;
  for (const part of parts) {
    let m = part.match(/(\d+)\s*[x\-]\s*([\d.]+)/i);
    if (m) { lastCount = +m[1]; out.push({ count: +m[1], pcd: parseFloat(m[2]) }); continue; }
    m = part.match(/^([\d.]+)$/); // "…/139.7" shorthand reuses the prior lug count
    if (m && lastCount != null) out.push({ count: lastCount, pcd: parseFloat(m[1]) });
  }
  return out;
}
const bpStr = (list) => list.map((p) => `${p.count}x${p.pcd}`).join("/");
const bpMatch = (a, b) => a && b && a.count === b.count && Math.abs(a.pcd - b.pcd) < 0.6;
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : null; };

// ── load vehicle wheel specs from every fitment-wheels-*.json ─────────────────
function loadVehicles() {
  const files = readdirSync(DATA_DIR).filter((f) => /^fitment-wheels-\d{4}\.json$/.test(f));
  const vehicles = [];
  for (const f of files) {
    const { year, models } = JSON.parse(readFileSync(join(DATA_DIR, f), "utf8"));
    for (const make of Object.keys(models || {})) {
      for (const model of Object.keys(models[make])) {
        const w = models[make][model];
        vehicles.push({
          year, make, model,
          bp: parseBP(w.boltPattern),
          hub: num(w.centerBore),
          wheels: (w.wheels || []).map((x) => ({ d: x.diameter, w: x.width, o: x.offset })),
        });
      }
    }
  }
  return { vehicles, years: files.map((f) => +f.match(/\d{4}/)[0]).sort() };
}

// Does this rim fit this vehicle?
function fits(rim, v) {
  if (!rim.bpList.some((p) => bpMatch(p, v.bp))) return false; // any of the rim's patterns
  if (v.hub != null && rim.cb != null && rim.cb < v.hub - 0.2) return false; // rim bore too small
  const atDia = v.wheels.filter((x) => x.d === rim.dia);
  if (!atDia.length) return false; // vehicle doesn't run this diameter
  // width/offset sanity vs the OE range at that diameter (skip a bound if data missing)
  const ws = atDia.map((x) => x.w).filter((x) => typeof x === "number");
  const os = atDia.map((x) => x.o).filter((x) => typeof x === "number");
  if (rim.width != null && ws.length && (rim.width < Math.min(...ws) - 1.0 || rim.width > Math.max(...ws) + 1.5)) return false;
  if (rim.offset != null && os.length && (rim.offset < Math.min(...os) - 15 || rim.offset > Math.max(...os) + 15)) return false;
  return true;
}

function yearRanges(years) {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  const out = []; let s = ys[0], p = ys[0];
  for (let i = 1; i < ys.length; i++) { if (ys[i] === p + 1) { p = ys[i]; continue; } out.push(s === p ? `${s}` : `${s}–${p}`); s = p = ys[i]; }
  out.push(s === p ? `${s}` : `${s}–${p}`);
  return out.join(", ");
}

// ── Shopify rim catalog (READ) ────────────────────────────────────────────────
async function loadRims() {
  const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN, TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN, VER = process.env.SHOPIFY_API_VERSION || "2024-10";
  const URL = `https://${DOMAIN}/admin/api/${VER}/graphql.json`;
  const gql = async (q, v = {}) => (await (await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN }, body: JSON.stringify({ query: q, variables: v }) })).json()).data;
  const Q = `query($after:String){products(first:100,after:$after,query:"product_type:*Rims* OR product_type:Alloy"){pageInfo{hasNextPage} edges{cursor node{ id title status
    bp:metafield(namespace:"custom",key:"bolt_pattern"){value} rd:metafield(namespace:"custom",key:"rim_diameter"){value}
    rw:metafield(namespace:"custom",key:"rim_width"){value} ro:metafield(namespace:"custom",key:"rim_offset"){value}
    cb:metafield(namespace:"custom",key:"center_bore"){value} }}}}`;
  const rims = []; let after = null;
  for (let p = 0; p < 10; p++) {
    const d = await gql(Q, { after }); const es = d?.products?.edges || [];
    for (const { node: n, cursor } of es) {
      after = cursor;
      rims.push({ id: n.id, title: n.title, status: n.status, bpList: parseBPList(n.bp?.value), bpRaw: n.bp?.value || "", dia: num(n.rd?.value), width: num(n.rw?.value), offset: num(n.ro?.value), cb: num(n.cb?.value) });
    }
    if (!d?.products?.pageInfo?.hasNextPage) break;
  }
  return rims;
}

// ── run ────────────────────────────────────────────────────────────────────
const { vehicles, years } = loadVehicles();
console.log(`Loaded ${vehicles.length} vehicle configs from ${years[0]}–${years[years.length - 1]} (${years.length} yrs).`);
const rims = await loadRims();
const ready = rims.filter((r) => r.bpList.length && r.dia != null && r.cb != null);
console.log(`Loaded ${rims.length} rim products; ${ready.length} have bolt pattern + diameter + bore.\n`);

let detailShown = 0;
for (const rim of ready) {
  const matched = vehicles.filter((v) => fits(rim, v));
  const byModel = new Map();
  for (const v of matched) { const k = `${v.make}|${v.model}`; (byModel.get(k) || byModel.set(k, []).get(k)).push(v.year); }
  const models = [...byModel.entries()].map(([k, ys]) => { const [mk, md] = k.split("|"); return { mk, md, yr: yearRanges(ys) }; })
    .sort((a, b) => a.mk.localeCompare(b.mk) || a.md.localeCompare(b.md));
  rim._count = models.length;
  rim._sample = models.slice(0, 8).map((m) => `${m.mk} ${m.md} (${m.yr})`);
  if (detailShown < 6 && models.length) {
    detailShown++;
    console.log(`● ${rim.title}`);
    console.log(`   ${bpStr(rim.bpList)} | ${rim.dia}x${rim.width ?? "?"} ET${rim.offset ?? "?"} CB${rim.cb} → fits ${models.length} models (2015–21 data):`);
    for (const s of rim._sample) console.log(`      • ${s}`);
    if (models.length > 8) console.log(`      … +${models.length - 8} more`);
    console.log();
  }
}

// summary
const withMatches = ready.filter((r) => r._count > 0).length;
console.log(`── summary ──`);
console.log(`rims with ≥1 compatible model: ${withMatches}/${ready.length}`);
const dist = ready.map((r) => r._count).sort((a, b) => a - b);
if (dist.length) console.log(`compatible-model count per rim: min ${dist[0]} / median ${dist[Math.floor(dist.length / 2)]} / max ${dist[dist.length - 1]}`);
console.log(`(coverage is partial — only 2015–2021 pulled so far; 2022–2026 will add more)`);

const zero = ready.filter((r) => r._count === 0);
if (zero.length) {
  console.log(`\n── ${zero.length} rims with ZERO matches (why?) ──`);
  for (const r of zero) console.log(`   ✗ ${r.title}\n       ${bpStr(r.bpList)} | ${r.dia}x${r.width ?? "?"} ET${r.offset ?? "?"} CB${r.cb}`);
}
const skipped = rims.filter((r) => !(r.bpList.length && r.dia != null && r.cb != null));
if (skipped.length) {
  console.log(`\n── ${skipped.length} rims SKIPPED (missing specs) ──`);
  for (const r of skipped) console.log(`   – ${r.title}  [bp=${r.bpList.length ? "y" : "n"} dia=${r.dia ?? "-"} cb=${r.cb ?? "-"} width=${r.width ?? "-"} offset=${r.offset ?? "-"}]`);
}

if (WRITE) console.log("\n--write requested: (metafield write step not yet enabled — will wire after format check)");
