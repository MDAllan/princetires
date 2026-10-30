const T=process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,S=process.env.SHOPIFY_STORE_DOMAIN,V=process.env.SHOPIFY_API_VERSION||"2026-04";
const H={"X-Shopify-Access-Token":T,"Content-Type":"application/json"};
const gql=async(query,variables)=>(await fetch(`https://${S}/admin/api/${V}/graphql.json`,{method:"POST",headers:H,body:JSON.stringify({query,variables})})).json();
const [handle,title,desc,apply]=process.argv.slice(2);
const p=(await gql(`query($q:String!){ pages(first:1, query:$q){ nodes{ id handle title templateSuffix t: metafield(namespace:"global",key:"title_tag"){value type} d: metafield(namespace:"global",key:"description_tag"){value type} } } }`,{q:`handle:${handle}`})).data.pages.nodes[0];
console.log("page:",p.id,p.handle,"template:",p.templateSuffix); console.log("BEFORE title:",p.t?.value,"[",p.t?.type,"]"); console.log("BEFORE desc :",p.d?.value,"[",p.d?.type,"]");
if(apply!=="--apply"){console.log("(dry run)");process.exit(0);}
const r=await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ metafields{ key value } userErrors{ field message } } }`,{m:[{ownerId:p.id,namespace:"global",key:"title_tag",type:(p.t?.type||"single_line_text_field"),value:title},{ownerId:p.id,namespace:"global",key:"description_tag",type:(p.d?.type||"multi_line_text_field"),value:desc}]});
console.log(JSON.stringify(r.data?.metafieldsSet ?? r.errors));
