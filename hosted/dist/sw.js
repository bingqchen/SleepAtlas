const VERSION='v43',CACHE=`sleep-atlas-hosted-${VERSION}`;
// Bump this independent cache whenever the pinned OCR files change.
const OCR_CACHE='sleep-atlas-ocr-6.0.1-core-6.0.0-eng-1.0.0';
const SHELL=['/','/style.css','/app.js','/offline.js','/collection.js','/detail-navigation.js','/level-preview.js','/favorite-berries.js','/berry-team.js','/evolution.js','/pokemon-stats.js','/local-api.js','/build-identity.js','/engine.js','/rp.js','/main-skills.js','/ocr.js','/import-batch.js','/import-review.js','/ocr-parser.js','/sprite-matcher.js','/sprite-features.json','/ingredient-matcher.js','/ingredient-features.json','/install.js','/catalog.json','/icon.svg','/sunshine-picnic.png','/icon-180.png','/icon-192.png','/icon-512.png','/manifest.webmanifest','/vendor/tesseract.min.js'];
// OEM 1 in ocr.js uses LSTM. Include both CPU variants, each with embedded WASM.
const OCR=['/vendor/worker.min.js','/vendor/tesseract-core-lstm.wasm.js','/vendor/tesseract-core-simd-lstm.wasm.js','/vendor/eng.traineddata.gz'];
const FILES=[...SHELL,...OCR],cacheName=path=>OCR.includes(path)?OCR_CACHE:CACHE;
async function usable(response,path){
  if(!response?.ok||response.redirected||response.type==='opaque')return false;
  const html=response.headers.get('content-type')?.includes('text/html');
  if(path==='/'||path==='/index.html'){
    const body=await response.clone().text();
    return body.includes('id="collection"')&&body.includes('src="/app.js"');
  }
  return !html;
}
async function cachedFile(path){return (await caches.open(cacheName(path))).match(path)}
async function offlineShellFile(path){
  // During an update, choose an entire complete shell, not individual files
  // from assorted versions. Keep the previous download usable until replaced.
  const names=(await caches.keys()).filter(name=>/^sleep-atlas-hosted-v\d+$/.test(name)&&Number(name.split('-v').at(-1))<Number(VERSION.slice(1))).sort((a,b)=>Number(b.split('-v').at(-1))-Number(a.split('-v').at(-1)));
  for(const name of [CACHE,...names.filter(name=>name!==CACHE)]){
    const cache=await caches.open(name);let complete=true;
    for(const file of SHELL)if(!await usable(await cache.match(file),file)){complete=false;break}
    if(complete)return cache.match(path);
  }
  return cachedFile(path);
}
async function downloadFile(path){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{
    const response=await fetch(path,{cache:'reload',redirect:'error',signal:controller.signal});
    if(!await usable(response,path))throw Error(`Could not download ${path}. Connect and sign in, then retry.`);
    await (await caches.open(cacheName(path))).put(path,response);
  }catch(error){
    if(error.name==='TypeError')throw Error(`Could not download ${path}. Check your connection, sign in if needed, and retry.`);
    throw error;
  }finally{clearTimeout(timer)}
}
async function offlineStatus(){
  let complete=0;for(const path of FILES)if(await usable(await cachedFile(path),path))complete++;
  return {version:VERSION,complete,total:FILES.length,ready:complete===FILES.length};
}
// Activation must not depend on network downloads. A failed asset download
// belongs to the visible, retryable download flow, not the worker lifecycle.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function pruneOldCaches(){
  // A previous worker can still finish a download after its successor activates.
  // It must never delete a newer shell or an OCR cache of unknown generation.
  for(const key of await caches.keys())if(/^sleep-atlas-hosted-v\d+$/.test(key)&&Number(key.split('-v').at(-1))<Number(VERSION.slice(1)))await caches.delete(key);
}
let downloadTask=null;
const listeners=new Set();
const send=(port,message)=>{try{port.postMessage(message)}catch{/* Closing a tab must not interrupt other downloads. */}};
function downloadOffline(port){
  listeners.add(port);
  if(!downloadTask)downloadTask=(async()=>{
    let complete=0;
    for(const path of FILES){
      if(!await usable(await cachedFile(path),path))await downloadFile(path);
      complete++;
      for(const listener of listeners)send(listener,{kind:'progress',version:VERSION,complete,total:FILES.length});
    }
    const status=await offlineStatus();
    if(!status.ready)throw Error('Some files are missing. Retry the download.');
    await pruneOldCaches();
    return status;
  })().finally(()=>{downloadTask=null});
  return downloadTask.then(status=>send(port,{kind:'done',...status})).catch(error=>send(port,{kind:'error',message:error.name==='QuotaExceededError'?'There is not enough device storage. Free some space, then retry.':error.name==='AbortError'?'The download timed out. Check your connection and retry.':error.message||'Download interrupted. Connect and retry.'})).finally(()=>{listeners.delete(port);port.close()});
}
self.addEventListener('message',event=>{
  const port=event.ports?.[0];if(!port)return;
  if(event.data?.type==='atlas:offline-download')event.waitUntil(downloadOffline(port));
  else if(event.data?.type==='atlas:offline-status')event.waitUntil(offlineStatus().then(status=>send(port,{kind:'done',...status})).catch(()=>send(port,{kind:'error',message:'Offline storage is unavailable. Try Safari or a regular browser window.'})).finally(()=>port.close()));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),path=url.pathname==='/index.html'?'/':url.pathname;
  if(event.request.method!=='GET'||url.origin!==self.location.origin||(!SHELL.includes(path)&&!url.pathname.startsWith('/vendor/')))return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName(path));
    if(OCR.includes(path)){const cached=await cache.match(path);if(await usable(cached,path))return cached}
    try{
      const response=await fetch(event.request,{cache:'no-cache'});
      if(await usable(response,path))try{await cache.put(path,response.clone())}catch{/* Full storage must not break a successful online response. */}
      return response; // Preserve real sign-in/permission responses.
    }catch{
      const cached=SHELL.includes(path)?await offlineShellFile(path):await cache.match(path);
      return await usable(cached,path)?cached:Response.error();
    }
  })());
});
