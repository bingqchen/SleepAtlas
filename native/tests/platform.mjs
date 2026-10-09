import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {isNativeApp,pickNativeScreenshots,exportBackup,configurePlatformUI} from '../../hosted/dist/platform.js';

const calls=[],released=[];
globalThis.location={href:'capacitor://localhost/index.html'};
globalThis.fetch=async url=>{calls.push(String(url));return new Response(new Blob([String(url)],{type:'image/png'}))};
const file=(name,host='localhost')=>({name,mimeType:'image/png',webPath:`capacitor://${host}/_capacitor_file_/tmp/${name}`});
let selection={sessionId:'session',files:[file('second.png'),file('first.png')]};
const bridge=globalThis.SleepAtlasNative={isNative:true,
  pickImages:async options=>{calls.push(options);return selection},
  releaseImport:async ({sessionId})=>released.push(sessionId),
  shareBackup:async options=>{calls.push(options);return {completed:false}},
};
assert.equal(isNativeApp(),true);
let files=await pickNativeScreenshots();
assert.deepEqual(calls[0],{screenshotsOnly:true,limit:20});
assert.deepEqual(files.map(f=>[f.name,f.type]),[['second.png','image/png'],['first.png','image/png']]);
assert.match(await files[0].text(),/second.png$/);
assert.deepEqual(released,['session']);
calls.length=0;
await pickNativeScreenshots({allPhotos:true,limit:2});
assert.deepEqual(calls[0],{screenshotsOnly:false,limit:2});
selection={cancelled:true};calls.length=0;
assert.deepEqual(await pickNativeScreenshots(),[]);assert.equal(calls.length,1);

for(const bad of [file('wrong.png','untrusted.example'),{...file('remote.png'),webPath:'https://localhost/_capacitor_file_/x'},
  {...file('not-file.png'),webPath:'capacitor://localhost/catalog.json'},
  {...file('credentials.png'),webPath:'capacitor://user@localhost/_capacitor_file_/x'}]){
  selection={sessionId:'rejected',files:[bad]};calls.length=0;
  await assert.rejects(pickNativeScreenshots(),/unavailable/);
  assert.equal(calls.length,1,'Reject before fetching a non-app URL');
  assert.equal(released.at(-1),'rejected','Failed selections release temporary files');
}
selection={sessionId:'too-many',files:Array.from({length:21},(_,i)=>file(`${i}.png`))};
await assert.rejects(pickNativeScreenshots(),/invalid/);
selection={sessionId:'unreadable',files:[file('broken.png')]};
globalThis.fetch=async()=>new Response('',{status:404});
await assert.rejects(pickNativeScreenshots(),/Could not read broken.png/);
assert.equal(released.at(-1),'unreadable');
globalThis.fetch=async()=>new Response(new Uint8Array(12*1024*1024+1));
await assert.rejects(pickNativeScreenshots(),/12 MB/);
const backup={version:1,pokemon:[]};
assert.deepEqual(await exportBackup(backup,'sleep-atlas.json'),{completed:false},'Share cancellation stays cancellation');
assert.deepEqual(calls.at(-1),{filename:'sleep-atlas.json',json:JSON.stringify(backup,null,2)});

const ids=Object.fromEntries(['install-button','offline-button','update-button','browse-all-photos'].map(id=>[id,{hidden:false}]));
const tags=[];const nodes={'#dropzone h3':{},'#dropzone > p':{}};
const doc={documentElement:{classList:{add:name=>tags.push(name)}},getElementById:id=>ids[id],querySelector:s=>nodes[s]};
configurePlatformUI(doc);
assert.equal(ids['browse-all-photos'].hidden,false);assert.equal(ids['update-button'].hidden,true);
assert.equal(tags[0],'native-app');
// Native install must not install a service worker or bind a PWA prompt.
const installer=await readFile(new URL('../../hosted/dist/install.js',import.meta.url),'utf8');
vm.runInNewContext(installer,{SleepAtlasNative:{isNative:true},window:{addEventListener:()=>assert.fail('Native install prompt')}});

delete globalThis.SleepAtlasNative;
assert.equal(isNativeApp(),false);
await assert.rejects(pickNativeScreenshots(),/unavailable/);
configurePlatformUI({get documentElement(){assert.fail('Browser UI must stay unchanged')}});
const link={click(){this.clicked=true}};
globalThis.document={createElement:tag=>{assert.equal(tag,'a');return link}};
assert.deepEqual(await exportBackup(backup,'web-backup.json'),{completed:true});
assert.equal(link.download,'web-backup.json');assert.equal(link.clicked,true);
assert.deepEqual(await (await (await import('node:buffer')).resolveObjectURL(link.href)).text(),JSON.stringify(backup,null,2));
console.log('Native/browser adapter: ordered selection, cancellation, URL isolation, cleanup, size limits, sharing, and PWA guards passed.');
