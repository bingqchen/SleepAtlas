import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Engine,MODEL_VERSION,ownSkillBerries} from '../dist/engine.js';
import {specialtyCounts,collectionRows} from '../dist/collection.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const engine=new Engine(catalog),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const make=(name,skillLevel=6)=>{const p=engine.species.get(name);return engine.validate({species:name,level:60,nature:'Hardy',skillLevel,carrySize:35,subskills:['','','','',''],ingredients:[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name)})};
for(const [name,amounts] of Object.entries({SCEPTILE:[11,14,21,24,27,30],MIMIKYU:[8,10,15,17,19,21],LATIOS:[12,21,29,38,43,48],CRESSELIA:[5,9,13,17,21,25]})){
 for(let i=0;i<6;i++){
  const b=make(name,i+1),c=engine.calculate(b),p=engine.species.get(name);
  assert.equal(ownSkillBerries(p.skill,i+1),amounts[i]);
  const total=amounts[i]+(name==='SCEPTILE'?4*p.skill.teamBerryAmounts[i]:0);
  close(c.ownSkillBerryCount,c.skillTriggers*amounts[i]);close(c.skillBerryCount,c.skillTriggers*total);
  close(c.berryCount,c.gatheredBerryCount+c.skillBerryCount);
  const value=Math.floor(Math.max(p.berry.value+b.level-1,p.berry.value*1.025**(b.level-1))+.5);
  close(c.skillBerryStrength,c.skillBerryCount*value);
  close(c.berryStrength,c.berryCount*value);
  close(c.strength,c.berryStrength+c.ingredientStrength+c.skillStrength);
  assert.deepEqual(specialtyCounts(c,p.specialty).map(x=>x.label),['berries']);
  const boosted=engine.calculate({...b,settings:{...b.settings,favoriteBerry:true,areaBonus:50}});
  close(boosted.skillBerryStrength,c.skillBerryStrength*3);close(boosted.berryCount,c.berryCount);
  const bfs=engine.calculate({...b,subskills:['Berry Finding S','','','','']});
  close(bfs.skillBerryCount,bfs.skillTriggers*total);
 }
 const a=engine.analyze(make(name));assert.ok(a.current.ratings.berryCount>=0&&a.current.ratings.berryCount<=100);
 for(const f of a.forecasts)close(f.berryCount,f.gatheredBerryCount+f.skillBerryCount);
}
for(const name of ['GARDEVOIR','MEWTWO','SHUCKLE','RAICHU','TOGEKISS']){
 const c=engine.calculate(make(name));assert.equal(c.skillBerryCount,0);assert.equal(c.berrySkill,false);close(c.berryCount,c.gatheredBerryCount);
}
assert.deepEqual(specialtyCounts(engine.calculate(make('GARDEVOIR')),'skill').map(x=>x.label),['skill triggers']);

await import(process.argv[2]);globalThis.fetch=async()=>new Response(JSON.stringify(catalog));
const {api,database,projectAnalysis}=await import('../dist/local-api.js');
const legacy=JSON.parse(fs.readFileSync(new URL('legacy-berry-analysis.json',import.meta.url)));
const db=await database(),id=crypto.randomUUID(),imageId=crypto.randomUUID(),timestamp='2026-10-01T00:00:00Z';
const old={id,createdAt:timestamp,updatedAt:timestamp,analysis:legacy,history:[{createdAt:timestamp,analysis:legacy}],historyCount:1,screenshots:[{id:imageId,filename:'test.png',text:[]}]};
await new Promise((resolve,reject)=>{const t=db.transaction(['pokemon','screenshots'],'readwrite');t.objectStore('pokemon').put(old);t.objectStore('screenshots').put({id:imageId,owner:id,blob:new Blob(['keep image'])});t.oncomplete=resolve;t.onerror=reject});
const listed=(await api('/api/pokemon'))[0],detail=await api('/api/pokemon/'+id);
assert.equal(detail.analysis.modelVersion,MODEL_VERSION);assert.deepEqual(listed,detail);assert.ok(Number.isInteger(detail.analysis.current.rp));
assert.ok(detail.analysis.current.berryCount>legacy.current.berryCount);assert.ok(detail.analysis.current.strength>legacy.current.strength);
assert.deepEqual(detail.analysis.build,legacy.build);assert.equal(detail.historyCount,1);assert.equal(detail.updatedAt,timestamp);
const stored=await new Promise(resolve=>{const r=db.transaction('pokemon').objectStore('pokemon').get(id);r.onsuccess=()=>resolve(r.result)});
assert.deepEqual(stored,old,'Read-time updates must preserve every original stored field and history');
const picture=await new Promise(resolve=>{const r=db.transaction('screenshots').objectStore('screenshots').get(imageId);r.onsuccess=()=>resolve(r.result)});
assert.equal(await picture.blob.text(),'keep image');
const cached={...legacy,build:{...legacy.build,nickname:'Cache check'}};
let calls=0;const counting={validate:b=>engine.validate(b),analyze:b=>{calls++;return engine.analyze(b)}};
const projected=projectAnalysis(cached,catalog,counting);assert.ok(Number.isInteger(projected.current.rp));projectAnalysis(cached,catalog,counting);assert.equal(calls,1);
projected.current.berryCount=0;assert.ok(projectAnalysis(cached,catalog,counting).current.berryCount>0,'Return independent projected results');
projectAnalysis({...cached,build:{...cached.build,skillLevel:1}},catalog,counting);assert.equal(calls,2,'Changes to full build invalidate cache');
assert.deepEqual(projectAnalysis(legacy,catalog),detail.analysis,'Cached-record fallback uses the same new model');
const berryRows=collectionRows([detail],catalog.species,{sort:'berries'});assert.equal(specialtyCounts(berryRows[0].analysis.current,'skill')[0].value,detail.analysis.current.berryCount);
db.close();console.log('Passed: all supported skill levels, own berry value, no double counting, bonuses, unchanged other skills, ratings, legacy refresh, cache and history/screenshot preservation.');
