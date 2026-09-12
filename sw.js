const CACHE="cr3atix-vigilance-v1.7.2";
const CORE=["./","./index.html","./styles.css","./app.js","./app-core-v16.js","./manifest.webmanifest","./icon.svg","./recommendations-v17.css","./recommendations-v17.js"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>{if(e.request.mode==="navigate")return caches.match("./index.html");return Response.error();})));});
