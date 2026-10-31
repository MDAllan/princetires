import { writeFileSync } from "node:fs";
const T=process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,S=process.env.SHOPIFY_STORE_DOMAIN,V=process.env.SHOPIFY_API_VERSION||"2026-04"; const H={"X-Shopify-Access-Token":T};
const handles=process.argv.slice(2);
const blogs=(await (await fetch(`https://${S}/admin/api/${V}/blogs.json`,{headers:H})).json()).blogs; const blog=blogs.find(b=>b.handle==="news")||blogs[0];
for (const h of handles){ const j=await (await fetch(`https://${S}/admin/api/${V}/blogs/${blog.id}/articles.json?handle=${h}&fields=id,handle,title,body_html,published_at,updated_at`,{headers:H})).json(); const a=j.articles?.[0];
  if(!a){console.log("MISSING",h);continue;} writeFileSync(`art/before/${h}.json`,JSON.stringify({blog_id:blog.id,...a},null,1)); console.log(String(a.id).padEnd(14), (a.published_at?"pub ":"DRAFT"), String(a.body_html.length).padStart(6), h, "| links RF:", a.body_html.includes("/pages/road-force-balancing")); }
