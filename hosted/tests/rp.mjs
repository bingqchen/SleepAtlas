import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import{spawnSync}from'node:child_process';
import{Engine,MODEL_VERSION}from'../dist/engine.js';import{calculateRP,rpComponents,rpFloor}from'../dist/rp.js';import{createLevelPreview}from'../dist/level-preview.js';import{collectionRows}from'../dist/collection.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog),preview=createLevelPreview(catalog);
const make=(species,level,nature,skillLevel,subskills,ingredients)=>engine.validate({species,level,nature,skillLevel,subskills,ingredients});
// Independent real screenshot and pinned upstream regression expectations.
const fixtures=[
 [4591,make('GARDEVOIR',52,'Gentle',6,['Ingredient Finder M','Helping Speed M','Skill Trigger M','Inventory Up S','Skill Trigger S'],['Apple','Apple','Apple'])],
 [605,make('TREECKO',13,'Impish',1,['Berry Finding S','Inventory Up M','Skill Trigger S','Inventory Up S','Skill Level Up S'],['Egg','Coffee','Leek'])],
 [615,make('DRATINI',14,'Brave',1,['Berry Finding S','Inventory Up S','Ingredient Finder S','Inventory Up M','Helping Speed S'],['Herb','Herb','Oil'])],
 [342,make('FOONGUS',14,'Hasty',1,['Skill Trigger S','Inventory Up S','Ingredient Finder S','Energy Recovery Bonus','Ingredient Finder M'],['Mushroom','Mushroom','Mushroom'])],
 [5664,make('SCEPTILE',67,'Hasty',6,['Berry Finding S','Inventory Up S','Helping Speed M','Inventory Up L','Skill Trigger S'],['Egg','Coffee','Leek'])],
 [2904,make('PINSIR',50,'Quiet',1,['Ingredient Finder M','Ingredient Finder S','Dream Shard Bonus','Skill Level Up S','Skill Level Up M'],['Honey','Apple','Honey'])],
 [4449,make('PINSIR',60,'Quiet',1,['Ingredient Finder M','Ingredient Finder S','Dream Shard Bonus','Skill Level Up S','Skill Level Up M'],['Honey','Apple','Honey'])],
 [5698,make('ESPEON',60,'Jolly',7,['Berry Finding S','Skill Trigger M','Skill Trigger S','',''],['Milk','Cacao','Milk'])],
 [3911,make('GOLDUCK',38,'Lonely',7,['Berry Finding S','Skill Trigger M','Inventory Up L','Ingredient Finder S','Helping Speed S'],['Cacao','Apple','Cacao'])],
 [3555,make('RAICHU',53,'Naughty',4,['Berry Finding S','Sleep EXP Bonus','Skill Level Up S','Helping Bonus','Skill Trigger M'],['Apple','Apple','Apple'])]
];
for(const [expected,b]of fixtures)assert.equal(calculateRP(catalog,b),expected,b.species+' screenshot/source RP');
const b=fixtures[0][1];assert.deepEqual(rpComponents(catalog,b),{value:4591,helps:9.7,ingredientChance:.1958,skillChance:.0685,ingredients:428.44,berries:717.66,skill:3843.84,misc:.92});
assert.equal(rpFloor(.58*100,0),58);
const saved=engine.analyze(b),snapshot=structuredClone(saved);
for(const settings of [{favoriteBerry:true,favoriteBerryMultiplier:2.4,helpingFrequencyFactor:.5,teamHelpingBonus:4,areaBonus:100,energyMultiplier:1,sleepHours:0,collectionHours:12},{helpingFrequencyFactor:1.5}]){
 const build=engine.validate({...b,settings,carrySize:200,displayedFrequencySeconds:100});assert.equal(engine.calculate(build).rp,4591);
 assert.equal(engine.calculate(build,b.level,{berryTeam:[]}).rp,4591);
}
for(const level of [25,30,50,60,70,80]){
 const view=preview(saved,level,{full:true,favoriteBerries:{berries:['MAGO'],multiplier:2.4,island:'custom',favoriteSpeed:50,nonFavoriteSpeed:-50}});
 assert.equal(view.current.rp,calculateRP(catalog,view.build));assert.equal(view.current.rp,preview(saved,level).current.rp);
 for(const f of view.forecasts)assert.equal(f.rp,calculateRP(catalog,view.build,f.level));
}
assert.deepEqual(saved,snapshot);assert.equal(calculateRP(catalog,b,80),null);
const p=engine.species.get('MEW'),mew=make('MEW',50,'Hardy',8,['','','','',''],[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name));assert.equal(calculateRP(catalog,mew),null);
assert.ok(calculateRP(catalog,{...mew,mainSkill:'Berry Burst'})>0);assert.equal(calculateRP(catalog,{...mew,mainSkill:'Berry Burst'}),calculateRP(catalog,{...mew,mainSkill:'Berry Burst',skillLevel:6}));
// Full catalog/levels parity, including unavailable80.
const builds=catalog.species.flatMap(p=>[25,30,50,60,70,80].map(level=>make(p.name,level,'Hardy',Math.min(6,p.skill.RP.length),['Helping Speed M','Helping Bonus','Ingredient Finder M','Inventory Up S','Skill Trigger M'],[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name))));
const py=spawnSync('python3',['-c','import json,sys,analysis_engine as e; print(json.dumps([e.calculate(e.validate_build(b))["rp"] for b in json.load(sys.stdin)]))'],{cwd:new URL('../../',import.meta.url),input:JSON.stringify(builds),encoding:'utf8'});assert.equal(py.status,0,py.stderr);JSON.parse(py.stdout).forEach((expected,i)=>assert.equal(engine.calculate(builds[i]).rp,expected,builds[i].species+' Python parity'));
const rows=[3,null,5,0,5,undefined].map((rp,i)=>({id:String(i),analysis:{build:{species:'GARDEVOIR'},current:{rp}}}));assert.deepEqual(collectionRows(rows,catalog.species,{sort:'rp'}).map(r=>r.id),['2','4','0','3','1','5']);
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),records=fixtures.slice(0,5).map(([rp,build],i)=>({id:String(i),analysis:engine.analyze(build)}));
const ctx=vm.createContext({records,catalog,levelOverride:null,favoriteBerryConfig:null,levelPreview:preview,berryTeamFor:()=>({berryTeam:null}),species:n=>engine.species.get(n),fmt:n=>String(n)});vm.runInContext(source.slice(source.indexOf('function teammateChoices('),source.indexOf('function openBerryTeam(')),ctx);const choices=vm.runInContext("teammateChoices('missing')",ctx);assert.deepEqual(Array.from(choices,c=>c.rp),[5664,4591,615,605,342]);assert.ok(choices.every(c=>c.label.includes('RP ')));
console.log(`Passed: ${fixtures.length} independent RP fixtures, exact component rounding, ${builds.length} Python parity builds, settings invariance, temporary levels, Mew caps/unknowns, unsupported80, RP sorting and teammate ordering.`);
