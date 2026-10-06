const CACHE='sleep-atlas-hosted-v16';
const SHELL=['/','/index.html','/style.css','/app.js','/collection.js','/evolution.js','/pokemon-stats.js','/local-api.js','/build-identity.js','/engine.js','/ocr.js','/ocr-parser.js','/sprite-matcher.js','/sprite-features.json','/ingredient-matcher.js','/ingredient-features.json','/install.js','/catalog.json','/icon.svg','/icon-180.png','/icon-192.png','/icon-512.png','/manifest.webmanifest','/vendor/tesseract.min.js'];
// Never cache an authentication redirect as the app shell.
const usable=response=>response.ok&&!response.redirected&&response.type!=='opaque';
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const path of SHELL){const response=await fetch(path,{cache:'reload'});if(!usable(response))throw Error('App files unavailable');await cache.put(path,response)}await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sleep-atlas-hosted-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||(!SHELL.includes(url.pathname)&&!url.pathname.startsWith('/vendor/')))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(event.request,{cache:'no-cache'});if(usable(response)){await cache.put(event.request,response.clone());return response}return response}catch{const cached=await cache.match(event.request);return cached||Response.error()}})());
});
