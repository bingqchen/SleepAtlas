import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {offlineRequest,activeWorker} from '../dist/offline.js';

const source=fs.readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');
const origin='https://sleep-atlas.test';
const key=input=>new URL(typeof input==='string'?input:input.url,origin).pathname;
function cacheStorage(){
  const stores=new Map();let quotaPath=null;
  return {stores,setQuota:path=>{quotaPath=path},async keys(){return [...stores.keys()]},async delete(name){return stores.delete(name)},async open(name){
    if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);
    return {async match(input){return data.get(key(input))?.clone()},async put(input,response){if(key(input)===quotaPath)throw new DOMException('quota','QuotaExceededError');data.set(key(input),response.clone())},async delete(input){return data.delete(key(input))}};
  }};
}
function worker(caches=cacheStorage(),version='v33'){
  const handlers={},requests=[];let failure=null,offline=false,claimed=false;
  const fetch=async(input,options)=>{
    const path=key(input);requests.push(path);if(offline)throw TypeError('Offline');
    if(failure?.path===path){
      if(failure.kind==='network')throw TypeError('Connection lost');
      if(failure.kind==='abort')throw new DOMException('timeout','AbortError');
      if(failure.kind==='html')return new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}});
      if(failure.kind==='redirect'){const r=new Response('redirect');Object.defineProperty(r,'redirected',{value:true});return r}
      return new Response('Forbidden',{status:403});
    }
    const file=new URL('../dist'+(path==='/'?'/index.html':path),import.meta.url);
    assert.ok(fs.existsSync(file),'Offline manifest names an existing asset: '+path);
    const type=path==='/'||path.endsWith('.html')?'text/html':path.endsWith('.json')?'application/json':path.endsWith('.js')?'text/javascript':'application/octet-stream';
    return new Response(fs.readFileSync(file),{headers:{'content-type':type}});
  };
  const context=vm.createContext({caches,fetch,Response,URL,AbortController,setTimeout,clearTimeout,self:{location:{origin},clients:{claim:async()=>{claimed=true}},skipWaiting:async()=>{},addEventListener:(type,handler)=>{handlers[type]=handler}}});
  vm.runInContext(source.replace("VERSION='v33'",`VERSION='${version}'`),context);
  const files=vm.runInContext('[...FILES]',context),ocr=vm.runInContext('[...OCR]',context);
  const lifecycle=type=>{let job;handlers[type]({waitUntil:p=>{job=p}});assert.ok(job,'waitUntil is called synchronously');return job};
  function message(type){const messages=[];let job,closed=false;handlers.message({data:{type},ports:[{postMessage:m=>messages.push(structuredClone(m)),close:()=>{closed=true}}],waitUntil:p=>{job=p}});assert.ok(job);return {messages,done:job.then(()=>{assert.ok(closed);return messages.at(-1)})}}
  const status=async()=>message('atlas:offline-status').done;
  const download=()=>message('atlas:offline-download');
  const fetchEvent=path=>{let response;handlers.fetch({request:new Request(origin+path),respondWith:p=>{response=p}});assert.ok(response);return response};
  return {caches,files,ocr,requests,lifecycle,message,status,download,fetchEvent,setFailure:value=>{failure=value},setOffline:value=>{offline=value},claimed:()=>claimed};
}

const w=worker();await w.lifecycle('install');await w.lifecycle('activate');assert.ok(w.claimed());
let status=await w.status();assert.equal(status.ready,false);assert.equal(status.complete,0);assert.equal(w.requests.length,0,'Activation requires no asset downloads');
assert.deepEqual(Array.from(w.ocr),['/vendor/worker.min.js','/vendor/tesseract-core-lstm.wasm.js','/vendor/tesseract-core-simd-lstm.wasm.js','/vendor/eng.traineddata.gz']);
const first=w.download(),second=w.download();assert.equal((await first.done).ready,true);assert.equal((await second.done).ready,true);
assert.ok(first.messages.some(m=>m.kind==='progress'));
for(const path of w.ocr)assert.equal(w.requests.filter(p=>p===path).length,1,'Concurrent downloads share one fetch');

// Readiness examines storage afresh, including every engine variant and app asset.
for(const path of ['/vendor/tesseract-core-lstm.wasm.js','/vendor/tesseract-core-simd-lstm.wasm.js','/vendor/worker.min.js','/vendor/eng.traineddata.gz','/catalog.json','/sprite-features.json','/ingredient-features.json','/offline.js']){
  const name=(await w.caches.keys()).find(name=>w.caches.stores.get(name).has(path));
  await (await w.caches.open(name)).delete(path);assert.equal((await w.status()).ready,false,path);
  assert.equal((await w.download().done).ready,true);
}
// Simulate a cold offline load of every real file, including root query strings.
w.setOffline(true);
for(const path of [...w.files,'/?from=home','/index.html']){
  const response=await w.fetchEvent(path);assert.ok(response.ok,path);assert.ok((await response.arrayBuffer()).byteLength>0,path);
}
assert.equal((await w.status()).ready,true);
const app=await (await w.fetchEvent('/app.js')).text();assert.match(app,/setupOffline/);

// A new app version rebuilds the shell but retains the separately pinned OCR cache.
w.setOffline(false);const upgraded=worker(w.caches,'v34');await upgraded.lifecycle('install');await upgraded.lifecycle('activate');
assert.equal((await upgraded.status()).ready,false);
assert.ok((await upgraded.caches.keys()).includes('sleep-atlas-hosted-v33'),'Keep the previous cache until the new download succeeds');
upgraded.setOffline(true);
for(const path of upgraded.files)assert.ok((await upgraded.fetchEvent(path)).ok,'An update keeps the previous offline download usable: '+path);
upgraded.setOffline(false);
assert.equal((await upgraded.download().done).ready,true);
assert.ok((await upgraded.caches.keys()).includes('sleep-atlas-hosted-v34'));
assert.ok(!(await upgraded.caches.keys()).includes('sleep-atlas-hosted-v33'));
assert.ok(upgraded.ocr.every(path=>!upgraded.requests.includes(path)));
await w.download().done;
assert.ok((await upgraded.caches.keys()).includes('sleep-atlas-hosted-v34'),'An older worker cannot delete a newer completed download');

for(const kind of ['network','abort','html','redirect','forbidden','quota']){
  const bad=worker();await bad.lifecycle('install');
  const path='/vendor/tesseract-core-simd-lstm.wasm.js';
  if(kind==='quota')bad.caches.setQuota(path);else bad.setFailure({path,kind});
  const result=await bad.download().done;assert.equal(result.kind,'error',kind);assert.equal((await bad.status()).ready,false);
  if(kind==='quota')assert.match(result.message,/storage/);
  bad.caches.setQuota(null);bad.setFailure(null);
  assert.equal((await bad.download().done).ready,true,kind+' is retryable');
  assert.equal(bad.requests.filter(p=>p==='/vendor/worker.min.js').length,1,'Retry reuses partial download');
}
// Activation survives asset failures, but sign-in HTML cannot count as the app.
const signedOut=worker();signedOut.setFailure({path:'/',kind:'html'});await signedOut.lifecycle('install');await signedOut.lifecycle('activate');assert.ok(signedOut.claimed());assert.equal((await signedOut.download().done).kind,'error');assert.equal((await signedOut.status()).ready,false);
const auth=worker();await auth.lifecycle('install');await auth.download().done;auth.setFailure({path:'/',kind:'forbidden'});
assert.equal((await auth.fetchEvent('/')).status,403);auth.setOffline(true);assert.match(await (await auth.fetchEvent('/')).text(),/id="collection"/);
const badJS=worker();await badJS.lifecycle('install');await badJS.download().done;badJS.setFailure({path:'/app.js',kind:'html'});
assert.match(await (await badJS.fetchEvent('/app.js')).text(),/Sign in/);badJS.setOffline(true);assert.match(await (await badJS.fetchEvent('/app.js')).text(),/setupOffline/);
const full=worker();await full.lifecycle('install');full.caches.setQuota('/vendor/worker.min.js');
assert.equal((await full.fetchEvent('/vendor/worker.min.js')).status,200,'Successful online responses survive cache quota failures');
assert.equal((await full.status()).ready,false,'A failed cache write cannot claim offline readiness');

// UI protocol errors never hang forever or claim an old worker is ready.
await assert.rejects(offlineRequest({postMessage(){}},'atlas:offline-status',undefined,10),/not responding/);
await assert.rejects(offlineRequest({postMessage:(_,ports)=>{ports[0].postMessage({kind:'done',version:'v26',ready:true});ports[0].close()}},'atlas:offline-status'),/update is ready/);
await assert.rejects(offlineRequest({postMessage:(_,ports)=>{ports[0].postMessage({kind:'error',message:'Storage full'});ports[0].close()}},'atlas:offline-status'),/Storage full/);
let progress=0;
const ready=await offlineRequest({postMessage:(_,ports)=>{ports[0].postMessage({kind:'progress',version:'v33',complete:1,total:2});ports[0].postMessage({kind:'done',version:'v33',ready:true});ports[0].close()}},'atlas:offline-download',()=>progress++);
assert.equal(progress,1);assert.equal(ready.ready,true);
console.log('Passed: real offline asset coverage, readiness, concurrent download, retry/quota/auth failures, offline fetches, query URLs, update retention and bounded UI messages.');

// Actual browser registration resolves before activation. Exercise that gap,
// failed installs, fresh registration, pending updates and listener cleanup.
class TrackedTarget extends EventTarget {
  listeners=new Set();
  addEventListener(type,fn){this.listeners.add(fn);super.addEventListener(type,fn)}
  removeEventListener(type,fn){this.listeners.delete(fn);super.removeEventListener(type,fn)}
}
class FakeWorker extends TrackedTarget {
  constructor(state='installing'){super();this.state=state}
  setState(state){this.state=state;this.dispatchEvent(new Event('statechange'))}
}
const registration=worker=>Object.assign(new TrackedTarget(),{installing:worker,waiting:null,active:null,update:async()=>{}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const activate=(r,w)=>{r.installing=null;r.waiting=null;r.active=w;w.setState('activated')};
const unexpected={register(){throw Error('Should reuse a live registration')}};
const starting=new FakeWorker(),initial=registration(starting);
let resolved=false;
const pending=activeWorker(()=>Promise.resolve(initial),unexpected).then(w=>{resolved=true;return w});
await tick();assert.equal(resolved,false);starting.setState('installed');starting.setState('activating');assert.equal(resolved,false);
activate(initial,starting);assert.equal(await pending,starting);assert.equal(starting.listeners.size,0);assert.equal(initial.listeners.size,0);
const waiting=new FakeWorker('installed'),waitingReg=registration(null);waitingReg.waiting=waiting;
const waitingJob=activeWorker(()=>waitingReg,unexpected);await tick();activate(waitingReg,waiting);assert.equal(await waitingJob,waiting);
const broken=new FakeWorker(),failed=registration(broken);
const failedJob=activeWorker(()=>failed,unexpected);const failureAssertion=assert.rejects(failedJob,/setup failed/);
await tick();failed.installing=null;broken.setState('redundant');await failureAssertion;assert.equal(broken.listeners.size,0);
let repairs=0;const repaired=new FakeWorker(),fixed=registration(repaired);
const retry=activeWorker(()=>failed,{async register(){repairs++;return fixed}});await tick();activate(fixed,repaired);assert.equal(await retry,repaired);assert.equal(repairs,1);
await assert.rejects(activeWorker(()=>null,{async register(){throw Error('Registration refused')}}),/Registration refused/);
await assert.rejects(activeWorker(()=>Promise.reject(Error('Original registration failed')),unexpected),/Original registration failed/);
// A registration with no current worker can be repaired by update().
const empty=registration(null),newWorker=new FakeWorker('activated');
empty.update=async()=>{empty.active=newWorker};
assert.equal(await activeWorker(()=>null,{register:async()=>empty}),newWorker);
const stale=new FakeWorker('activated'),installing=new FakeWorker(),updated=registration(installing);updated.active=stale;
const updateJob=activeWorker(()=>updated,unexpected);await tick();activate(updated,installing);assert.equal(await updateJob,installing);
const firstInstaller=new FakeWorker(),replacement=new FakeWorker(),changing=registration(firstInstaller);
const changingJob=activeWorker(()=>changing,unexpected);await tick();changing.installing=replacement;changing.dispatchEvent(new Event('updatefound'));activate(changing,replacement);assert.equal(await changingJob,replacement);assert.equal(firstInstaller.listeners.size,0);
const stalled=new FakeWorker(),stalledReg=registration(stalled);
await assert.rejects(activeWorker(()=>stalledReg,unexpected,10),/timed out/);assert.equal(stalled.listeners.size,0);assert.equal(stalledReg.listeners.size,0);
let finishRegistration;
const lateReg=registration(new FakeWorker());
await assert.rejects(activeWorker(()=>new Promise(resolve=>{finishRegistration=resolve}),unexpected,10),/timed out/);
finishRegistration(lateReg);await tick();assert.equal(lateReg.listeners.size,0,'Late resolution after timeout does not leak listeners');
console.log('Passed: activation races, waiting workers, install failure and retry, registration errors, updates, timeout cleanup.');
