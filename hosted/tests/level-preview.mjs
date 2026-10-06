import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Engine} from '../dist/engine.js';
import {createLevelPreview,TEMPORARY_LEVELS} from '../dist/level-preview.js';
import {collectionRows} from '../dist/collection.js';
import {calculatedStats,updatedCarrySize} from '../dist/pokemon-stats.js';
import {resolveMainSkill} from '../dist/main-skills.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog),preview=createLevelPreview(catalog);
const build={species:'GARDEVOIR',nickname:'Saved helper',level:52,nature:'Gentle',skillLevel:6,carrySize:29,displayedFrequencySeconds:1853,frequencySource:'recorded',
  subskills:['Ingredient Finder M','Helping Speed M','Skill Trigger M','Inventory Up S','Skill Trigger S'],ingredients:['Apple','Apple','Apple']};
const saved=engine.analyze(build),snapshot=structuredClone(saved);
for(const level of TEMPORARY_LEVELS){
  const partial=preview(saved,level),full=preview(saved,level,{full:true});
  assert.equal(full.build.level,level);assert.equal(full.build.skillLevel,saved.build.skillLevel);
  assert.equal(full.build.carrySize,updatedCarrySize(catalog,{...saved.build,level},saved.build));
  assert.equal(full.build.displayedFrequencySeconds,calculatedStats(catalog,{...saved.build,level}).frequencySeconds);
  assert.equal(full.build.frequencySource,'calculated');
  assert.deepEqual(full.current,engine.analyze(full.build).current);
  for(const key of ['strength','ingredientCount','berryCount','skillTriggers'])assert.equal(partial.current[key],full.current[key]);
  assert.equal(preview(saved,level,{full:true}),full,'Unchanged views reuse their rated analysis');
}
assert.equal(preview(saved,70).build.carrySize,35);assert.equal(preview(saved,25).build.carrySize,29);
assert.deepEqual(preview(saved,25).current.activeSubskills,['Helping Speed M','Ingredient Finder M']);
assert.ok(preview(saved,80).current.activeSubskills.includes('Skill Trigger S'));
assert.equal(preview(saved,null),saved);assert.deepEqual(saved,snapshot);
assert.throws(()=>preview(saved,55));
const sameLevel={...saved,build:{...saved.build,level:50,displayedFrequencySeconds:null}};
assert.equal(preview(sameLevel,50),sameLevel);assert.equal(preview(sameLevel,null).build.displayedFrequencySeconds,null);
const changed=engine.analyze({...saved.build,nature:'Hardy'});
assert.notEqual(preview(changed,70,{full:true}).current.skillTriggers,preview(saved,70,{full:true}).current.skillTriggers);
const high=engine.analyze({...saved.build,level:80,carrySize:35});
assert.equal(preview(high,25).build.carrySize,29,'Lower previews remove locked Inventory Up bonuses');
assert.deepEqual(preview(high,25).current.activeSubskills,['Helping Speed M','Ingredient Finder M']);
const slots=engine.analyze({...saved.build,ingredients:['Apple','Corn','Leek']});
const count=(level,name)=>preview(slots,level).current.ingredients.find(i=>i.name===name).count;
assert.equal(count(25,'Corn'),0);assert.ok(count(30,'Corn')>0);assert.equal(count(50,'Leek'),0);assert.ok(count(60,'Leek')>0);
const mewSpecies=engine.species.get('MEW'),mew=engine.analyze({...saved.build,species:'MEW',mainSkill:'Berry Burst',mewSkillChance:5.5,ingredients:[0,30,60].map(l=>mewSpecies[`ingredient${l}`][0].ingredient.name)});
const mewView=preview(mew,70,{full:true});assert.equal(mewView.build.mainSkill,mew.build.mainSkill);assert.equal(mewView.build.mewSkillChance,5.5);assert.ok(mewView.current.skillBerryCount>0);
const rows=[{id:'a',analysis:saved},{id:'b',analysis:mew}];
for(const sort of ['strength','rating']){
  const views=rows.map(r=>({...r,analysis:preview(r.analysis,70,{full:sort==='rating'})}));
  const sorted=collectionRows(views,catalog.species,{sort});
  const metric=r=>sort==='rating'?r.analysis.current.ratings.strength:r.analysis.current.strength;
  assert.ok(metric(sorted[0])>=metric(sorted[1]));assert.ok(sorted.every(r=>r.analysis.build.level===70));
}

// Run the real detail renderer and Edit handler: temporary stats may be shown,
// but opening the editor must pass the original saved build and screenshot IDs.
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const showing=source.slice(source.indexOf('async function showDetails('),source.indexOf('async function showExample('));
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',open:false,setAttribute(){},removeAttribute(){},showModal(){this.open=true},focus(){}});return nodes.get(id)};
let edited;
const row={id:'saved',analysis:saved,screenshots:[{id:'image',filename:'example',text:[]}],historyCount:1};
const ctx=vm.createContext({$:node,online:true,catalog,api:async()=>row,levelPreview:preview,visibleCollection:()=>[row],species:n=>engine.species.get(n),resolveMainSkill,
  updateDetailButtons(){},detailNavigation:()=>'',pokemonStats:()=>'',ingredientTable:()=>'',escapeHTML:String,fmt:String,bindClose(){},closeDetails(){},openEditor:(...args)=>edited=args,toast:message=>{throw Error(message)}});
vm.runInContext('let detailRequest=0,detailLoading=false,detailId=null,detailOrder=[],levelOverride=70;'+showing,ctx);
await vm.runInContext('showDetails("saved")',ctx);
assert.match(node('detail-body').innerHTML,/TEMPORARY PREVIEW · LV. 70/);assert.match(node('detail-body').innerHTML,/Saved level: 52/);
node('edit-pokemon').onclick();assert.equal(edited[0],saved.build);assert.equal(edited[1].id,'saved');assert.equal(edited[1].imageIds[0],'image');
assert.deepEqual(saved,snapshot);

await import(process.argv[2]);globalThis.fetch=async()=>new Response(JSON.stringify(catalog));
const {api,database}=await import('../dist/local-api.js');
const {id}=await api('/api/pokemon',{method:'POST',body:JSON.stringify({build})});
const actual=await api('/api/pokemon/'+id),backup=await api('/api/backup');
for(const level of TEMPORARY_LEVELS)preview(actual.analysis,level,{full:true});
assert.deepEqual((await api('/api/backup')).pokemon,backup.pokemon);
assert.deepEqual(await api('/api/pokemon/'+id),actual,'Preview must not update saved stats, timestamps, or history');
(await database()).close();
console.log('Passed: all temporary levels, summary/detail agreement, ratings and sorting, upward/downward unlocks, ingredient slots, carry/frequency, cache invalidation, Mew skills, saved editor values and unchanged backups/history.');
