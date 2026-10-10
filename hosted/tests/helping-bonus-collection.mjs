import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Engine,favoriteMultiplier} from '../dist/engine.js';
import {automaticHelpingBonusTeam} from '../dist/helping-bonus.js';
import {createLevelPreview} from '../dist/level-preview.js';
import {collectionRows} from '../dist/collection.js';
import {calculatedStats} from '../dist/pokemon-stats.js';
import {resolveMainSkill} from '../dist/main-skills.js';
import {berryOptions,describeFavorites,favoriteSettings,favoriteSkillLevelBonus,favoriteSkillTriggerMultiplier} from '../dist/favorite-berries.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog);
const ids=rows=>Array.from(rows,row=>row.id);
const copy=value=>structuredClone(value);
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),message||`${a} != ${b}`);

// Deliberately disagreeing input order, names, total strength and own production
// catch selection by the visual list or by another owner's credited HB gain.
const candidate=(id,strength,ownStrength)=>({id,analysis:{build:{species:'RAICHU',nickname:`Helper ${id}`},current:{strength,...(ownStrength===undefined?{}:{ownStrength})}}});
const candidates=[candidate('owner',9999),candidate('z',10),candidate('c',30),candidate('b',30),candidate('a',20),candidate('boosted',999999,1),candidate('bad',NaN)];
const candidateSnapshot=copy(candidates),contextCalls=[];
const selected=automaticHelpingBonusTeam(candidates,'owner',row=>{contextCalls.push(row.id);return {mainSkillLevelBonus:1,skillTriggerMultiplier:1.25,berryTeam:[]}});
assert.deepEqual(ids(selected),['b','c','a']);
assert.deepEqual(contextCalls,['b','c','a'],'Resolve context only for the actual selected recipients');
assert.ok(selected.every(member=>member.mainSkillLevelBonus===1&&member.skillTriggerMultiplier===1.25&&member.berryTeam.length===0));
assert.deepEqual(ids(automaticHelpingBonusTeam([...candidates].reverse(),'owner')),['b','c','a'],'Ties use stable IDs, independent of input or display order');
assert.deepEqual(ids(automaticHelpingBonusTeam([candidate('owner',100),candidate('zero',90,0)],'owner')),['zero'],'Zero own strength does not fall back to inflated total strength');
assert.deepEqual(automaticHelpingBonusTeam([candidate('owner',100)],'owner'),[]);
assert.equal(automaticHelpingBonusTeam(candidates.slice(0,3),'owner').length,2);
assert.deepEqual(candidates,candidateSnapshot,'Selection never reorders or annotates saved rows');

function makeBuild(species,level,nickname,subskills=['Helping Bonus','Helping Speed M','Berry Finding S','Inventory Up S','Skill Trigger M']){
  const p=engine.species.get(species);
  const build=engine.validate({species,level,nickname,nature:'Hardy',skillLevel:3,carrySize:p.carrySize+10,
    subskills,ingredients:[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name),settings:{...catalog.defaults}});
  return {...build,displayedFrequencySeconds:calculatedStats(catalog,build).frequencySeconds,frequencySource:'calculated'};
}
const row=(id,build)=>({id,analysis:engine.analyze(build),historyCount:1,screenshots:[],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
const originalRows=[
  row('owner',makeBuild('RAICHU',25,'Keep owner')),
  row('raichu',makeBuild('RAICHU',40,'Keep electric')),
  row('walrein',makeBuild('WALREIN',35,'Keep ice')),
  row('gardevoir',makeBuild('GARDEVOIR',50,'Other skill')),
  row('typhlosion',makeBuild('TYPHLOSION',30,'Other fire')),
  row('butterfree',makeBuild('BUTTERFREE',25,'Other bug')),
];
const originalSnapshot=copy(originalRows);
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
function section(start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,`Cannot locate app behavior between ${start} and ${end}`);
  return source.slice(from,to);
}
const collectionCode=section('function baselineCollection(', 'function setLevelOverride(');
const detailCode=section('async function showDetails(', 'async function showExample(');
const nodes=new Map(),node=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',open:false,setAttribute(){},removeAttribute(){},showModal(){this.open=true},focus(){}});
  return nodes.get(id);
};
node('sort').value='name';
const realPreview=createLevelPreview(catalog),previewCalls=[];
let renderedCurrent,edited;
const ctx=vm.createContext({catalog,records:copy(originalRows),levelOverride:null,favoriteBerryConfig:null,online:false,$:node,
  collectionRows,automaticHelpingBonusTeam,favoriteSkillLevelBonus,favoriteSkillTriggerMultiplier,
  berryTeamFor:()=>({berryTeam:null,missing:0}),
  levelPreview:(analysis,level,options)=>{const result=realPreview(analysis,level,options);previewCalls.push({analysis,level,options,result});return result},
  species:name=>engine.species.get(name),resolveMainSkill,favoriteMultiplier,berryOptions,describeFavorites,
  updateDetailButtons(){},detailNavigation:()=>'',pokemonStats:()=>'',ingredientTable:()=>'',
  helpingBonusSummary:current=>{renderedCurrent=current;return ''},escapeHTML:String,fmt:String,bindClose(){},
  closeDetails(){},openEditor:(...args)=>{edited=args},toast:message=>{throw Error(message)},
});
vm.runInContext('let detailRequest=0,detailLoading=false,detailId=null,detailOrder=[];'+collectionCode+detailCode,ctx);
const baseline=()=>vm.runInContext('baselineCollection()',ctx);
const teamFor=id=>{ctx.requestedOwner=ctx.records.find(r=>r.id===id);assert.ok(ctx.requestedOwner);return vm.runInContext('helpingBonusTeamFor(requestedOwner)',ctx)};
const visible=()=>vm.runInContext('visibleCollection()',ctx);
// Expected selection is independently computed from raw modeled output. No HB
// helper is used to establish the expected ranking in these integration checks.
function expectedIds(rows,ownerId){return rows.filter(r=>r.id!==ownerId).map(r=>[r.id,r.analysis.current.ownStrength??r.analysis.current.strength]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3).map(x=>x[0])}
const expected=expectedIds(baseline(),'owner');
for(const sort of ['name','recent','level','speed','rp','strength','rating']){
  node('sort').value=sort;
  const views=visible(),owner=views.find(r=>r.id==='owner');
  assert.deepEqual(ids(teamFor('owner')),expected,`${sort} is presentation only`);
  assert.deepEqual(ids(owner.analysis.current.helpingBonusTeam),expected);
  assert.ok(owner.analysis.current.helpingBonusStrength>0,'An active HB owner receives positive marginal support');
  close(owner.analysis.current.strength,owner.analysis.current.ownStrength+owner.analysis.current.helpingBonusStrength);
  const own=baseline().find(r=>r.id==='owner').analysis.current;
  for(const metric of ['rp','berryCount','ingredientCount','skillTriggers','frequencySeconds'])assert.equal(owner.analysis.current[metric],own[metric],`${metric} remains the owner's own metric`);
}
assert.deepEqual(ctx.records,originalRows,'Repeated sorting and analysis must not mutate source records');

// Prefix and specialty filters define the candidate pool, including two or no
// companions. The owner can also be viewed while outside the current filter.
node('search').value='Keep';node('sort').value='name';
assert.deepEqual(new Set(ids(teamFor('owner'))),new Set(['raichu','walrein']));
node('type-filter').value='skill';
assert.equal(baseline().length,0);assert.deepEqual(ids(teamFor('owner')),[]);
node('search').value='';
assert.deepEqual(ids(teamFor('owner')),['gardevoir']);
node('type-filter').value='';node('search').value='Keep owner';
assert.deepEqual(ids(teamFor('owner')),[]);
assert.equal(visible()[0].analysis.current.helpingBonusStrength,0,'No other matching helper contributes zero support');
node('search').value='';

// Both previewed build stats and island skill/berry context must reach selected
// recipients, not just the evaluated owner. Saved skill levels remain unchanged.
ctx.levelOverride=60;
ctx.favoriteBerryConfig={island:'custom',berries:['GREPA','MAGO'],multiplier:2.4,favoriteSpeed:20,nonFavoriteSpeed:-35,mainSkillLevelBonus:1,skillTriggerMultiplier:1.25};
let previewTeam=teamFor('owner');
assert.deepEqual(ids(previewTeam),expectedIds(baseline(),'owner'));
assert.ok(previewTeam.every(member=>member.build.level===60));
for(const member of previewTeam){
  const saved=ctx.records.find(r=>r.id===member.id).analysis.build;
  assert.deepEqual(member.build.settings,favoriteSettings({...saved,level:60},catalog,ctx.favoriteBerryConfig));
  assert.equal(member.build.skillLevel,saved.skillLevel);
  assert.equal(member.mainSkillLevelBonus,favoriteSkillLevelBonus(member.build,catalog,ctx.favoriteBerryConfig));
  assert.equal(member.skillTriggerMultiplier,favoriteSkillTriggerMultiplier(member.build,catalog,ctx.favoriteBerryConfig));
}
assert.ok(previewTeam.some(member=>member.mainSkillLevelBonus===1&&member.skillTriggerMultiplier===1.25),'Fixture exercises island bonuses on a selected recipient');
const islandOwner=visible().find(r=>r.id==='owner').analysis;
ctx.favoriteBerryConfig={...ctx.favoriteBerryConfig,berries:['RAWST'],mainSkillLevelBonus:0,skillTriggerMultiplier:1};
assert.notEqual(visible().find(r=>r.id==='owner').analysis.current.helpingBonusStrength,islandOwner.current.helpingBonusStrength,'Changed island settings invalidate recipient support');
ctx.levelOverride=null;ctx.favoriteBerryConfig=null;

// Resolve from the current collection after rename/filter changes, strength
// edits and deletion. Names in cached detail summaries must update too.
node('search').value='Keep';
const renamed=ctx.records.find(r=>r.id==='raichu');
renamed.analysis=engine.analyze({...renamed.analysis.build,nickname:'Outside renamed'});
assert.deepEqual(ids(teamFor('owner')),['walrein'],'A renamed helper that stops matching leaves the pool');
node('search').value='';
let beforeEdit=visible().find(r=>r.id==='owner').analysis;
const strongestId=teamFor('owner')[0].id,strongest=ctx.records.find(r=>r.id===strongestId);
strongest.analysis=engine.analyze({...strongest.analysis.build,nickname:'Renamed strongest'});
const renamedView=visible().find(r=>r.id==='owner').analysis;
assert.equal(renamedView.current.helpingBonusTeam.find(m=>m.id===strongestId).name,'Renamed strongest');
assert.notEqual(renamedView,beforeEdit,'Recipient changes invalidate derived view cache');
strongest.analysis=engine.analyze({...strongest.analysis.build,level:1});
const afterEdit=teamFor('owner');
assert.ok(!ids(afterEdit).includes(strongestId),'A reduced-level helper is replaced by a stronger candidate');
assert.deepEqual(ids(afterEdit),expectedIds(baseline(),'owner'));
const removed=afterEdit[0].id;ctx.records=ctx.records.filter(r=>r.id!==removed);
assert.ok(!ids(teamFor('owner')).includes(removed));
assert.deepEqual(ids(teamFor('owner')),expectedIds(baseline(),'owner'));

// Exercise the actual detail renderer with the same selection as the list,
// including full reference ratings. Capture its inputs/results instead of
// matching fragile HTML or duplicating the application's context assembly.
ctx.records=copy(originalRows);ctx.levelOverride=60;
ctx.favoriteBerryConfig={island:'custom',berries:['GREPA'],multiplier:2.4,mainSkillLevelBonus:1,skillTriggerMultiplier:1.25};
node('sort').value='strength';
const listOwner=visible().find(r=>r.id==='owner').analysis,listTeam=copy(teamFor('owner'));
previewCalls.length=0;
await vm.runInContext('showDetails("owner")',ctx);
const detailCall=previewCalls.findLast(call=>call.options.full&&call.analysis===ctx.records.find(r=>r.id==='owner').analysis);
assert.ok(detailCall,'Details requests a fully rated analysis');
assert.deepEqual(copy(detailCall.options.helpingBonusTeam),listTeam,'List and details use identical recipient builds and context');
assert.equal(renderedCurrent,detailCall.result.current,'The detail renderer displays the full contextual result');
for(const metric of ['strength','ownStrength','helpingBonusStrength','rp','berryCount','ingredientCount','skillTriggers'])assert.equal(renderedCurrent[metric],listOwner.current[metric],`${metric} agrees between list and detail`);
const full=detailCall.result,fullContext={helpingBonusTeam:listTeam,berryTeam:null,
  mainSkillLevelBonus:favoriteSkillLevelBonus(full.build,catalog,ctx.favoriteBerryConfig),skillTriggerMultiplier:favoriteSkillTriggerMultiplier(full.build,catalog,ctx.favoriteBerryConfig)};
assert.deepEqual(full.current.ratings,engine.analyze(full.build,fullContext).current.ratings,'Reference comparisons retain exactly the selected recipient context');
for(const forecast of full.forecasts)assert.deepEqual(forecast.helpingBonusTeam,full.current.helpingBonusTeam,'Forecasts keep recipient levels and marginal values fixed');
node('edit-pokemon').onclick();assert.equal(edited[0],ctx.records.find(r=>r.id==='owner').analysis.build,'Editing receives saved stats, not projected teammate data');
assert.deepEqual(ctx.records,originalRows);assert.deepEqual(originalRows,originalSnapshot);

// A locked HB owner still needs the context for future levels and synthetic
// comparison builds. Supplying [] is also distinct from no contextual analysis.
const locked=row('locked',makeBuild('RAICHU',25,'Locked owner',['Berry Finding S','Helping Speed M','Helping Bonus','Inventory Up S','Skill Trigger M']));
const lockedFull=realPreview(locked.analysis,null,{full:true,helpingBonusTeam:listTeam});
assert.equal(lockedFull.current.helpingBonusStrength,0);
assert.ok(lockedFull.forecasts.find(f=>f.level===60).helpingBonusStrength>0);
assert.deepEqual(lockedFull.current.ratings,engine.analyze(locked.analysis.build,{helpingBonusTeam:listTeam}).current.ratings);
assert.notEqual(realPreview(locked.analysis,null,{full:true,helpingBonusTeam:[]}),locked.analysis);

// Real local-api transactions run only against a fresh in-memory IndexedDB.
// Neither contextual previews nor detail rendering may alter backups/history.
await import(process.argv[2]||'fake-indexeddb/auto');
globalThis.fetch=async()=>new Response(JSON.stringify(catalog));
const {api,database}=await import('../dist/local-api.js');
const stored=[];
for(const sourceRow of originalRows){
  // Distinguish the two Raichu so normal progression deduplication does not
  // interpret them as two snapshots of one saved Pokémon.
  const build={...sourceRow.analysis.build,...(sourceRow.id==='raichu'?{nature:'Adamant'}:{})};
  const {id}=await api('/api/pokemon',{method:'POST',body:JSON.stringify({build})});
  stored.push(await api('/api/pokemon/'+id));
}
const backupBefore=await api('/api/backup'),storedBefore=copy(stored);
ctx.records=stored;ctx.levelOverride=70;ctx.favoriteBerryConfig={island:'custom',berries:['GREPA','MAGO'],multiplier:2.4};node('sort').value='rating';
visible();
ctx.requestedId=stored[0].id;await vm.runInContext('showDetails(requestedId)',ctx);
assert.deepEqual(stored,storedBefore);
assert.deepEqual((await api('/api/backup')).pokemon,backupBefore.pokemon);
for(const saved of storedBefore)assert.deepEqual(await api('/api/pokemon/'+saved.id),saved,'Stored levels, settings, timestamps, history and analysis remain unchanged');
(await database()).close();
console.log('Passed: automatic HB top-three selection, self exclusion, ties/no feedback, filters, preview/island context, live rename/edit/delete reselection, list/detail/reference agreement, locked forecasts, and unchanged IndexedDB records/backups.');
