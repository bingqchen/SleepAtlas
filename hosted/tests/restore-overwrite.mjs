import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compatibleImport} from '../dist/build-identity.js';
await import(process.argv[2]);
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
globalThis.fetch=async()=>new Response(JSON.stringify(catalog));
const {api,database,savePictures}=await import('../dist/local-api.js');
const db=await database(),post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
const restore=pokemon=>post('/api/restore',{format:'sleep-atlas',version:1,pokemon});
const read=(store,id)=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const count=async store=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const reset=async rows=>new Promise((resolve,reject)=>{const t=db.transaction(['pokemon','screenshots'],'readwrite');t.oncomplete=resolve;t.onabort=t.onerror=()=>reject(t.error);t.objectStore('pokemon').clear();t.objectStore('screenshots').clear();for(const row of rows)t.objectStore('pokemon').add(structuredClone(row))});
const result=(added=0,updated=0,unchanged=0,skipped=0)=>({added,updated,unchanged,skipped});
const base={species:'RAICHU',nickname:'Local',level:20,nature:'Hardy',skillLevel:1,carrySize:31,subskills:['Skill Trigger S','Helping Speed S','Ingredient Finder S','Inventory Up S','Skill Level Up S'],ingredients:['Apple','Ginger','Apple'],settings:catalog.defaults,notes:'Local note'};
const newer={...base,nickname:'Imported',notes:'Imported note',level:35,skillLevel:4,carrySize:50,displayedFrequencySeconds:null,settings:{...catalog.defaults,areaBonus:20},subskills:['Skill Trigger M','Helping Speed M',...base.subskills.slice(2)]};
assert.ok(compatibleImport(base,newer,catalog));assert.ok(compatibleImport(newer,base,catalog));
for(const change of [{nature:'Gentle'},{ingredients:['Apple','Apple','Apple']},{subskills:['Helping Speed S','Skill Trigger S',...base.subskills.slice(2)]},{subskills:['',...base.subskills.slice(1)]},{mainSkill:'Berry Burst'},{species:'CHARIZARD'}])assert.equal(compatibleImport(base,{...base,...change},catalog,{sameId:true}),false);
assert.equal(compatibleImport(base,{...base,species:'PIKACHU'},catalog),false);
assert.equal(compatibleImport(base,{...base,species:'PIKACHU'},catalog,{sameId:true}),true);
const imageId=crypto.randomUUID();await savePictures([{id:imageId,filename:'local.png',mime:'image/png',blob:new Blob(['local']),text:[],createdAt:new Date().toISOString()}]);
const {id}=await post('/api/pokemon',{build:base,imageIds:[imageId]});const original=await read('pokemon',id);
assert.deepEqual(await restore([{id,build:newer}]),result(0,1));
let saved=await read('pokemon',id);assert.equal(saved.analysis.build.level,35);assert.equal(saved.analysis.build.skillLevel,4);assert.equal(saved.analysis.build.carrySize,50);assert.equal(saved.analysis.build.nickname,'Imported');assert.equal(saved.analysis.build.notes,'Imported note');assert.equal(saved.analysis.build.displayedFrequencySeconds,null);assert.equal(saved.analysis.build.settings.areaBonus,20);assert.equal(saved.historyCount,2);assert.deepEqual(saved.history[0],original.history[0]);assert.equal(saved.createdAt,original.createdAt);assert.deepEqual(saved.screenshots,original.screenshots);assert.equal((await read('screenshots',imageId)).owner,id);
assert.deepEqual(await restore([{id,build:newer}]),result(0,0,1));assert.deepEqual(await read('pokemon',id),saved,'Identical restore preserves history and timestamps');
const externalId=crypto.randomUUID();assert.deepEqual(await restore([{id:externalId,build:base}]),result(0,1));assert.equal(await read('pokemon',externalId),undefined);assert.equal((await read('pokemon',id)).analysis.build.level,20,'Imported older stats also win');
const gentle={...base,nature:'Gentle'},otherId=crypto.randomUUID();assert.deepEqual(await restore([{id:otherId,build:gentle}]),result(1));
const beforeConflict=await read('pokemon',otherId);assert.deepEqual(await restore([{id,build:{...gentle,level:45}}]),result(0,0,0,1));assert.deepEqual(await read('pokemon',otherId),beforeConflict,'An incompatible exact ID cannot redirect to another matching helper');
assert.deepEqual(await restore([{id,build:{...newer,species:'PIKACHU'}}]),result(0,1));assert.equal((await read('pokemon',id)).analysis.build.species,'PIKACHU');
// Whole-batch validation happens before any writes.
const beforeInvalid=await api('/api/backup');await assert.rejects(restore([{id,build:{...newer,species:'PIKACHU',level:40}},{id:crypto.randomUUID(),build:{}}]));assert.deepEqual((await api('/api/backup')).pokemon,beforeInvalid.pokemon);
// Fresh backups can contain distinct helpers with the same build.
const firstId=crypto.randomUUID(),secondId=crypto.randomUUID();await reset([]);
assert.deepEqual(await restore([{id:firstId,build:base},{id:secondId,build:base}]),result(2));
assert.deepEqual(await restore([{id:crypto.randomUUID(),build:newer}]),result(0,0,0,1),'Multiple saved matches are ambiguous');
assert.deepEqual(await restore([{id:firstId,build:newer},{id:secondId,build:base}]),result(0,1,1));assert.equal((await read('pokemon',secondId)).analysis.build.level,20);
const anchor=await read('pokemon',firstId);
// A conflicting exact-ID entry still reserves its own local identity.
for(const reverse of [false,true]){
 await reset([anchor]);const entries=[{id:firstId,build:gentle},{id:crypto.randomUUID(),build:base}];if(reverse)entries.reverse();
 assert.deepEqual(await restore(entries),result(0,0,0,2));assert.deepEqual(await read('pokemon',firstId),anchor);
}
// Two cross-ID updates aimed at one helper are skipped, independent of order.
for(const reverse of [false,true]){
 await reset([anchor]);const entries=[{id:crypto.randomUUID(),build:base},{id:crypto.randomUUID(),build:{...newer,level:40}}];if(reverse)entries.reverse();
 assert.deepEqual(await restore(entries),result(0,0,0,2));assert.deepEqual(await read('pokemon',firstId),anchor);
 // Exact ID takes priority over a competing cross-ID candidate.
 entries[0].id=firstId;assert.deepEqual(await restore(entries),result(0,1,0,1));assert.equal((await read('pokemon',firstId)).analysis.build.level,entries[0].build.level);
}
// Concurrent restores serialize; only the first actual change adds history.
await reset([anchor]);const concurrent=await Promise.all([restore([{id:firstId,build:base}]),restore([{id:firstId,build:base}])]);assert.equal(concurrent.reduce((n,r)=>n+r.updated,0),1);assert.equal(concurrent.reduce((n,r)=>n+r.unchanged,0),1);assert.equal((await read('pokemon',firstId)).historyCount,anchor.historyCount+1);
// Legacy embedded images replace old evidence once, without accumulating copies.
await reset([anchor]);const legacy=[{id:firstId,build:newer,screenshots:[{filename:'legacy.png',mime:'image/png',data:Buffer.from('legacy image').toString('base64'),ocr:{lines:[{text:'Raichu',x:0,y:0,confidence:99}]}}]}];
assert.deepEqual(await restore(legacy),result(0,1));const pictured=await read('pokemon',firstId);assert.equal(await count('screenshots'),1);assert.equal((await read('screenshots',pictured.screenshots[0].id)).owner,firstId);
assert.deepEqual(await restore(legacy),result(0,0,1));assert.deepEqual(await read('pokemon',firstId),pictured);assert.equal(await count('screenshots'),1);
assert.deepEqual(await restore([{id:firstId,build:{...newer,level:45}}]),result(0,1));assert.deepEqual((await read('pokemon',firstId)).screenshots,pictured.screenshots);
// Force a write-stage failure after the first put: neither row may change.
const beforeAbort=await read('pokemon',firstId),tx=db.transaction.bind(db);let puts=0;
db.transaction=(...args)=>{const t=tx(...args),objectStore=t.objectStore.bind(t);t.objectStore=name=>{const s=objectStore(name);if(name==='pokemon'){const put=s.put.bind(s);s.put=(...a)=>{if(++puts===2)throw Error('Simulated write failure');return put(...a)}}return s};return t};
await assert.rejects(restore([{id:firstId,build:{...newer,level:50}},{id:crypto.randomUUID(),build:gentle}]),/Simulated write failure/);db.transaction=tx;
assert.deepEqual(await read('pokemon',firstId),beforeAbort);assert.equal(await count('pokemon'),1);
db.close();console.log('Passed: compatible overwrite, cross-ID matching, evolution, conflicts, exact-ID priority, batch ambiguity, idempotence, images/history, validation, concurrent restores and transaction rollback.');
