import { writeFileSync } from "node:fs";
const T=process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,S=process.env.SHOPIFY_STORE_DOMAIN,V=process.env.SHOPIFY_API_VERSION||"2026-04";
const j=await (await fetch(`https://${S}/admin/api/${V}/pages.json?handle=${process.argv[2]}&fields=id,handle,title,body_html,template_suffix`,{headers:{"X-Shopify-Access-Token":T}})).json();
const p=j.pages[0]; writeFileSync(`art/before/page-${p.handle}.json`,JSON.stringify(p,null,1)); console.log(p.id,p.handle,"template:",p.template_suffix,"\n"+p.body_html);
