import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {Engine,MODEL_VERSION,berryValueAtLevel,hasTeamBerrySkill} from '../dist/engine.js';
import {resolveBerryTeam} from '../dist/berry-team.js';
import {createLevelPreview} from '../dist/level-preview.js';
import {projectAnalysis} from '../dist/local-api.js';
import {resolveMainSkill} from '../dist/main-skills.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog),preview=createLevelPreview(catalog);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const make=(species='LATIOS',level=60)=>{const p=engine.species.get(species);return engine.validate({species,level,nature:'Hardy',skillLevel:6,carrySize:35,subskills:['Skill Trigger M','Helping Speed M','Berry Finding S','',''],ingredients:[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name),settings:{areaBonus:50}})};
const member=(species,level=30,favoriteMultiplier=1)=>({species,level,favoriteMultiplier});
const base=make(),auto=engine.calculate(base),solo=engine.calculate(base,60,{berryTeam:[]});
assert.equal(hasTeamBerrySkill(engine.species.get('LATIOS').skill),true);
assert.equal(auto.teamBerryMode,'automatic');assert.equal(auto.teamMemberCount,4);assert.equal(auto.uniqueDragonSpecies,1);assert.equal(auto.latiasBonusBerries,0);
assert.equal(auto.skillBerriesPerTrigger,48);assert.equal(auto.teamBerriesPerTrigger,12);
assert.equal(solo.teamBerryMode,'selected');assert.equal(solo.teamBerriesPerTrigger,0);assert.equal(solo.uniqueDragonSpecies,1);
// Complete pinned upstream matrix: all six skill levels and 1–5 unique Dragons.
const own=[[12,21,29,38,43,48],[14,24,29,39,44,50],[18,29,35,42,48,55],[18,30,37,45,49,55],[20,33,41,49,53,58]];
const team=[[1,1,1,1,2,3],[1,1,2,2,3,4],[1,1,2,3,4,4],[2,2,3,4,5,5],[2,2,3,4,5,5]],latias=[2,4,6,8,9,10];
const dragons=['DRATINI','DRAGONAIR','DRAGONITE','ALTARIA'];
for(let count=1;count<=5;count++)for(let skillLevel=1;skillLevel<=6;skillLevel++){
 const berryTeam=dragons.slice(0,count-1).map(n=>member(n));
 const c=engine.calculate({...base,skillLevel},60,{berryTeam});
 assert.equal(c.uniqueDragonSpecies,count);assert.equal(c.skillBerriesPerTrigger,own[count-1][skillLevel-1]);
 assert.equal(c.teamBerriesPerTrigger,team[count-1][skillLevel-1]*(count-1));
 if(count>1){berryTeam[0]=member('LATIAS');const withLatias=engine.calculate({...base,skillLevel},60,{berryTeam});assert.equal(withLatias.skillBerriesPerTrigger,c.skillBerriesPerTrigger+latias[skillLevel-1]);assert.equal(withLatias.teamBerriesPerTrigger,c.teamBerriesPerTrigger)}
}
const mixed=[member('LATIAS',25,2.4),member('LATIAS',50,2),member('LATIOS',70,1),member('RAICHU',80,2.4)],actual=engine.calculate(base,60,{berryTeam:mixed});
assert.equal(actual.uniqueDragonSpecies,2,'Duplicates and non-Dragons do not increase species count');assert.equal(actual.latiasBonusBerries,10,'Latias bonus applies once');
assert.equal(actual.skillBerriesPerTrigger,60);assert.equal(actual.teamBerriesPerTrigger,16,'All receivers get berries, including duplicate species and non-Dragons');
const values=mixed.reduce((n,m)=>n+berryValueAtLevel(engine.species.get(m.species).berry,m.level)*m.favoriteMultiplier,0);
close(actual.teamSkillBerryStrength,actual.skillTriggers*4*values*1.5);
close(actual.ownSkillBerryStrength,actual.skillTriggers*60*berryValueAtLevel(engine.species.get('LATIOS').berry,60)*1.5);
close(actual.berryCount,actual.gatheredBerryCount+actual.ownSkillBerryCount+actual.teamSkillBerryCount);
close(actual.strength,actual.berryStrength+actual.ingredientStrength+actual.skillStrength);
for(const key of ['skillTriggers','gatheredBerryCount','ingredientCount','ingredientStrength','rp'])close(actual[key],solo[key]);
const boosted=engine.calculate({...base,skillLevel:5},60,{berryTeam:mixed,mainSkillLevelBonus:1});assert.equal(boosted.mainSkillLevel,6);assert.equal(boosted.skillBerriesPerTrigger,60);
assert.equal(engine.calculate(base,60,{berryTeam:mixed,mainSkillLevelBonus:1}).mainSkillLevel,6);
const rateBoost=engine.calculate(base,60,{berryTeam:mixed,skillTriggerMultiplier:1.25});assert.ok(rateBoost.skillTriggers>actual.skillTriggers);close(rateBoost.skillBerryCount/rateBoost.skillTriggers,76);
const rated=engine.analyze(base,{berryTeam:mixed});assert.ok(rated.current.ratings.berryCount>=0);
for(const f of rated.forecasts){assert.equal(f.uniqueDragonSpecies,2);assert.equal(f.latiasBonusBerries,10);close(f.teamSkillBerryStrength/f.skillTriggers,actual.teamSkillBerryStrength/actual.skillTriggers)}
for(const a of rated.ingredientAlternatives)close(a.strength,engine.calculate({...base,ingredients:a.slots},60,{berryTeam:mixed}).strength);
const records=[{id:'owner',analysis:engine.analyze(base)},{id:'latias',analysis:engine.analyze(make('LATIAS',25))},{id:'dragon',analysis:engine.analyze(make('DRATINI',30))}],ids=['latias','dragon'];
const config={berries:['YACHE'],multiplier:2.4};
const resolved=resolveBerryTeam(ids,'owner',records,catalog,70,config),view=preview(records[0].analysis,70,{full:true,favoriteBerries:config,...resolved});
assert.equal(view.current.uniqueDragonSpecies,3);assert.ok(resolved.berryTeam.every(m=>m.level===70&&m.favoriteMultiplier===2.4));
const gone=resolveBerryTeam(ids,'owner',records.filter(r=>r.id!=='latias'),catalog),after=preview(records[0].analysis,null,{...gone});
assert.equal(gone.missing,1);assert.equal(after.current.uniqueDragonSpecies,2);assert.equal(after.current.latiasBonusBerries,0);
const noTeam=preview(records[0].analysis,null,{...resolveBerryTeam(ids,'owner',[records[0]],catalog)});assert.equal(noTeam.current.teamBerriesPerTrigger,0);
const legacy={...records[0].analysis,modelVersion:'atlas-1.9-web',current:{...solo}};
const refreshed=projectAnalysis(legacy,catalog);assert.equal(refreshed.modelVersion,MODEL_VERSION);assert.equal(refreshed.current.teamBerriesPerTrigger,12);assert.deepEqual(refreshed.build,legacy.build);assert.equal(legacy.current.teamBerriesPerTrigger,0);
// The local Python calculator uses the same automatic default; no selection UI there.
const builds=Array.from({length:6},(_,i)=>({...base,skillLevel:i+1}));
const py=spawnSync('python3',['-c','import json,sys,analysis_engine as e; print(json.dumps([e.calculate(e.validate_build(b)) for b in json.load(sys.stdin)]))'],{cwd:new URL('../../',import.meta.url),input:JSON.stringify(builds),encoding:'utf8'});assert.equal(py.status,0,py.stderr);
const expected=JSON.parse(py.stdout);for(let i=0;i<6;i++)for(const k of ['strength','berryCount','skillBerryCount','teamBerriesPerTrigger','uniqueDragonSpecies'])close(engine.calculate(builds[i])[k],expected[i][k]);
// Execute the actual picker setup and context resolver outside browser storage.
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',value:'',hidden:false,showModal(){this.open=true}});return nodes.get(id)};
const uiRecords=[...records,{id:'sceptile',analysis:engine.analyze(make('SCEPTILE'))}];
const ctx=vm.createContext({$:node,records:uiRecords,catalog,resolveMainSkill,hasTeamBerrySkill,resolveBerryTeam,
 teammateChoices:()=>[{value:'latias',label:'Latias · RP 1000'}],options:(available,id)=>JSON.stringify({available,id}),updateBerryTeamChoices(){}});
vm.runInContext("let berryTeamOwner=null,berryTeams={owner:['latias']},levelOverride=null,favoriteBerryConfig=null;"+app.slice(app.indexOf('function openBerryTeam('),app.indexOf('function updateBerryTeamChoices('))+app.slice(app.indexOf('function berryTeamFor('),app.indexOf('function visibleCollection(')),ctx);
vm.runInContext("openBerryTeam('owner')",ctx);assert.equal(node('berry-team-title').textContent,'Draco Meteor teammates');assert.equal(node('draco-team-help').hidden,false);assert.equal(node('berry-team-mode').value,'selected');assert.equal(node('berry-team-dialog').open,true);assert.match(node('berry-team-fields').innerHTML,/latias/);
const uiTeam=vm.runInContext('berryTeamFor(records[0])',ctx);assert.equal(uiTeam.berryTeam[0].species,'LATIAS');assert.equal(engine.calculate(base,60,uiTeam).latiasBonusBerries,10);
vm.runInContext("openBerryTeam('sceptile')",ctx);assert.equal(node('berry-team-title').textContent,'Berry Burst teammates');assert.equal(node('draco-team-help').hidden,true);assert.equal(node('berry-team-mode').value,'automatic');
console.log('Passed: Draco Meteor full level/species matrix, Latias once, duplicate/non-Dragon receivers, individual berry values, bonuses, totals, forecasts, previews, missing teammates, old-analysis refresh, Python defaults and actual picker/context wiring.');
