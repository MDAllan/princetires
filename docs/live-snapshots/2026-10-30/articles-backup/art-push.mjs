// Applies art/after/*.json. Before each PUT it re-reads the live body and refuses unless it still equals art/before (no clobbering a newer edit).
import { readFileSync, readdirSync } from "node:fs";
const T=process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,S=process.env.SHOPIFY_STORE_DOMAIN,V=process.env.SHOPIFY_API_VERSION||"2026-04"; const H={"X-Shopify-Access-Token":T,"Content-Type":"application/json"};
for (const f of readdirSync("art/after")) { const after=JSON.parse(readFileSync("art/after/"+f,"utf8")), before=JSON.parse(readFileSync("art/before/"+f,"utf8"));
  const isPage=f.startsWith("page-"); const base=isPage?`https://${S}/admin/api/${V}/pages/${after.id}.json`:`https://${S}/admin/api/${V}/blogs/${after.blog_id}/articles/${after.id}.json`;
  const cur=(await (await fetch(base,{headers:H})).json())[isPage?"page":"article"];
  if(cur.body_html!==before.body_html){ console.log("✗ SKIP (changed since backup)",f); process.exitCode=2; continue; }
  const r=await fetch(base,{method:"PUT",headers:H,body:JSON.stringify({[isPage?"page":"article"]:{id:after.id,body_html:after.body_html}})});
  const j=await r.json(); const got=j[isPage?"page":"article"];
  console.log(r.ok&&got.body_html.includes("/pages/road-force-balancing")?"✓":"✗", f.replace(".json",""), r.status, got?.updated_at||JSON.stringify(j.errors));
  await new Promise(res=>setTimeout(res,500)); }
