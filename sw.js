const CACHE="cr3atix-vigilance-v2.0.0";
const CORE=["./","./index.html","./styles.css","./app.js","./app-core-v16.js","./manifest.webmanifest","./icon.svg","./recommendations-v17.css","./recommendations-v17.js","./runtime-v18.css","./runtime-v18.js","./onboarding-v20.css","./onboarding-v200.js"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:"window"});
  await Promise.all(clients.map(client=>client.navigate(client.url).catch(()=>null)));
})()));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const req=e.request;
  const url=new URL(req.url);
  const sameOrigin=url.origin===self.location.origin;
  const dynamic=sameOrigin&&(req.mode==="navigate"||req.destination==="script"||req.destination==="style"||url.pathname.endsWith('/sw.js')||url.pathname.endsWith('/manifest.webmanifest'));
  if(dynamic){
    e.respondWith(fetch(req,{cache:"no-store"}).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(req,copy));
      return r;
    }).catch(()=>caches.match(req).then(hit=>hit||(req.mode==="navigate"?caches.match("./index.html"):Response.error()))));
    return;
  }
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{
    const copy=r.clone();
    caches.open(CACHE).then(c=>c.put(req,copy));
    return r;
  }).catch(()=>req.mode==="navigate"?caches.match("./index.html"):Response.error())));
});
