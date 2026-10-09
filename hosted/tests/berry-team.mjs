import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {Engine,berryValueAtLevel,hasTeamBerryBurst} from '../dist/engine.js';
import {resolveMainSkill} from '../dist/main-skills.js';
import {resolveBerryTeam,validateBerryTeamIds} from '../dist/berry-team.js';
import {createLevelPreview} from '../dist/level-preview.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog),preview=createLevelPreview(catalog);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const make=(species='SCEPTILE',level=60)=>{const p=engine.species.get(species);return engine.validate({species,level,nature:'Hardy',skillLevel:6,carrySize:35,subskills:['Skill Trigger M','Helping Speed M','Berry Finding S','',''],ingredients:[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name),settings:{areaBonus:50}})};
const base=make(),auto=engine.calculate(base),solo=engine.calculate(base,base.level,{berryTeam:[]});
assert.equal(auto.teamBerryMode,'automatic');assert.equal(solo.teamBerryMode,'selected');assert.equal(auto.teamMemberCount,4);assert.equal(solo.teamSkillBerryCount,0);
close(auto.skillBerryCount,auto.skillTriggers*50);close(auto.ownSkillBerryCount,auto.skillTriggers*30);close(auto.teamSkillBerryCount,auto.skillTriggers*20);
close(auto.skillBerryStrength,solo.skillBerryStrength*5/3);
for(const k of ['skillTriggers','gatheredBerryCount','ingredientCount','ingredientStrength','skillStrength','normalHelps','sneakyHelps'])close(auto[k],solo[k]);
const mixed=[{species:'GARDEVOIR',level:25,favoriteMultiplier:2.4},{species:'RAICHU',level:80,favoriteMultiplier:1},{species:'SCEPTILE',level:50,favoriteMultiplier:2},{species:'RAICHU',level:30,favoriteMultiplier:2.4}];
const teamValue=mixed.reduce((sum,m)=>sum+berryValueAtLevel(engine.species.get(m.species).berry,m.level)*m.favoriteMultiplier,0);
for(let size=0;size<=4;size++){
 const c=engine.calculate(base,60,{berryTeam:mixed.slice(0,size)});close(c.teamSkillBerryCount,c.skillTriggers*size*5);assert.equal(c.teamMemberCount,size);
 close(c.strength,c.berryStrength+c.ingredientStrength+c.skillStrength);
 close(c.berryStrength,solo.berryStrength+c.teamSkillBerryStrength);close(c.berryCount,c.gatheredBerryCount+c.ownSkillBerryCount+c.teamSkillBerryCount);
}
const actual=engine.calculate(base,60,{berryTeam:mixed});close(actual.teamSkillBerryStrength,actual.skillTriggers*5*teamValue*1.5);
const noArea=engine.calculate({...base,settings:{...base.settings,areaBonus:0}},60,{berryTeam:mixed});close(actual.teamSkillBerryStrength,noArea.teamSkillBerryStrength*1.5);
for(const bad of [{},Array(5).fill(mixed[0]),[{...mixed[0],level:0}],[{...mixed[0],favoriteMultiplier:4}],[{...mixed[0],species:'UNKNOWN'}]])assert.throws(()=>engine.calculate(base,60,{berryTeam:bad}));
for(const name of ['MIMIKYU','CRESSELIA','GARDEVOIR','MEWTWO'])assert.deepEqual(engine.calculate(make(name)),engine.calculate(make(name),60,{berryTeam:mixed}),'Other skills remain unchanged');
const parity=[];
for(const p of catalog.species.filter(p=>hasTeamBerryBurst(p.skill)))for(let skillLevel=1;skillLevel<=6;skillLevel++){
 const b={...make(p.name),skillLevel},c=engine.calculate(b);close(c.skillBerryCount,c.skillTriggers*[15,22,29,36,43,50][skillLevel-1]);parity.push(b);
}
const mew={...make('MEW'),mainSkill:'Berry Burst',skillLevel:8};assert.equal(engine.calculate(mew).teamBerriesPerTrigger,20);assert.equal(engine.calculate({...mew,mainSkill:'Metronome'}).teamBerryMode,null);parity.push(mew);
for(const favoriteBerry of [false,true])for(const favoriteBerryMultiplier of [2,2.4])parity.push({...base,settings:{...base.settings,favoriteBerry,favoriteBerryMultiplier}});
const py=spawnSync('python3',['-c','import json,sys,analysis_engine as e; print(json.dumps([e.calculate(e.validate_build(b)) for b in json.load(sys.stdin)]))'],{cwd:new URL('../../',import.meta.url),input:JSON.stringify(parity),encoding:'utf8'});assert.equal(py.status,0,py.stderr);
const expected=JSON.parse(py.stdout);for(let i=0;i<parity.length;i++)for(const k of ['strength','berryStrength','skillBerryCount','ownSkillBerryCount','teamSkillBerryCount','teamSkillBerryStrength','berryCount'])close(engine.calculate(parity[i])[k],expected[i][k]);
// Independently build the comparison population with the same team assumptions.
const rated=engine.analyze(base,{berryTeam:mixed}),inventory=b=>b.subskills.reduce((n,s,i)=>n+(s&&[10,25,50,70,80][i]<=b.level&&s.startsWith('Inventory Up')?catalog.subskills.find(x=>x.name===s).amount:0),0);
const samples=catalog.referenceBuilds.map(sample=>{const b={...base,...sample};b.carrySize=base.carrySize-inventory(base)+inventory(b);return engine.calculate(b,b.level,{berryTeam:mixed})});
for(const key of ['strength','berryCount']){const points=100*samples.reduce((n,s)=>n+(s[key]<rated.current[key]-1e-7?1:Math.abs(s[key]-rated.current[key])<=1e-7?.5:0),0)/samples.length;assert.equal(rated.current.ratings[key],(Math.abs(points%1-.5)<1e-10?Math.floor(points)+(Math.floor(points)%2):Math.round(points)))}
for(const f of rated.forecasts){close(f.teamSkillBerryStrength/f.skillTriggers,actual.teamSkillBerryStrength/actual.skillTriggers)}
for(const variant of rated.ingredientAlternatives)close(variant.strength,engine.calculate({...base,ingredients:variant.slots},60,{berryTeam:mixed}).strength);
const autoForecast=engine.analyze(base).forecasts[0];assert.ok(autoForecast.teamSkillBerryStrength/autoForecast.skillTriggers>auto.teamSkillBerryStrength/auto.skillTriggers);
// Saved references resolve fresh, independent of collection filters.
const owner=crypto.randomUUID(),ids=[crypto.randomUUID(),crypto.randomUUID()],records=[{id:owner,analysis:engine.analyze(base)},{id:ids[0],analysis:engine.analyze(make('GARDEVOIR',25))},{id:ids[1],analysis:engine.analyze(make('RAICHU',80))}];
assert.equal(resolveBerryTeam(undefined,owner,records,catalog).berryTeam,null);assert.deepEqual(resolveBerryTeam([],owner,records,catalog).berryTeam,[]);
for(const list of [[owner],[ids[0],ids[0]],Array(5).fill('a'),[null]])assert.throws(()=>validateBerryTeamIds(list,owner));
const favorites={berries:['MAGO'],multiplier:2.4},resolved=resolveBerryTeam(ids,owner,records,catalog,null,favorites);
assert.deepEqual(resolved.berryTeam.map(m=>m.favoriteMultiplier),[2.4,1]);assert.deepEqual(resolved.berryTeam.map(m=>m.level),[25,80]);
const projected=resolveBerryTeam(ids,owner,records,catalog,70,favorites);assert.ok(projected.berryTeam.every(m=>m.level===70));
const a=preview(records[0].analysis,null,{full:true,...resolved});assert.notEqual(a.current.strength,records[0].analysis.current.strength,'Explicit team forces projection even without other overrides');
records[1].analysis.build.level=60;const changed=preview(records[0].analysis,null,{full:true,...resolveBerryTeam(ids,owner,records,catalog,null,favorites)});assert.notEqual(changed.current.strength,a.current.strength);
const gone=resolveBerryTeam(ids,owner,[records[0]],catalog);assert.equal(gone.missing,2);assert.deepEqual(gone.berryTeam,[]);assert.equal(preview(records[0].analysis,null,{...gone}).current.teamSkillBerryCount,0);
// Use real preference transactions; no saved Pokemon data is modified.
await import(process.argv[2]);globalThis.fetch=async()=>new Response(JSON.stringify(catalog));
const {api,database}=await import('../dist/local-api.js');const saved=await api('/api/pokemon',{method:'POST',body:JSON.stringify({build:base})});const before=await api('/api/pokemon/'+saved.id),backup=await api('/api/backup');
const cacheDB=await new Promise(resolve=>{const r=indexedDB.open('berry-team-test',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>resolve(r.result)});
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,textContent:'',close(){this.closed=true}});return nodes.get(id)};
node('berry-team-form').elements=[{disabled:false},{disabled:true}];node('berry-team-mode').value='selected';node('berry-teammate-0').value=ids[0];
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('let berryTeamOwner='),source.indexOf('function bindClose('));
let renders=0;const ctx=vm.createContext({$:node,records,catalog,cacheDB:Promise.resolve(cacheDB),validateBerryTeamIds,renderCollection(){renders++},showDetails:async()=>{},toast(){}});
vm.runInContext('let berryTeams={};'+code,ctx);ctx.owner=owner;vm.runInContext('berryTeamOwner=owner',ctx);await vm.runInContext('applyBerryTeam()',ctx);
const read=()=>new Promise(resolve=>{const r=cacheDB.transaction('cache').objectStore('cache').get('berry-teams');r.onsuccess=()=>resolve(r.result)});
assert.deepEqual((await read())[owner],[ids[0]]);assert.equal(renders,1);assert.equal(node('berry-team-dialog').closed,true);assert.deepEqual(node('berry-team-form').elements.map(f=>f.disabled),[false,true]);
node('berry-teammate-1').value=ids[0];await vm.runInContext('applyBerryTeam()',ctx);assert.match(node('berry-team-status').textContent,/different teammates/);assert.deepEqual((await read())[owner],[ids[0]]);
node('berry-teammate-0').value='';node('berry-teammate-1').value='';await vm.runInContext('applyBerryTeam()',ctx);assert.deepEqual((await read())[owner],[],'Explicit empty team survives storage');
node('berry-team-mode').value='automatic';await vm.runInContext('applyBerryTeam()',ctx);assert.equal((await read())[owner],undefined);
assert.deepEqual(await api('/api/pokemon/'+saved.id),before);assert.deepEqual((await api('/api/backup')).pokemon,backup.pokemon);
cacheDB.close();(await database()).close();
console.log(`Passed: ${parity.length} Python automatic-team cases, 0–4 mixed teammates, bonuses, totals, ratings/forecasts, live references, cache invalidation, missing IDs, temporary levels, preference transactions, and unchanged saved records.`);
