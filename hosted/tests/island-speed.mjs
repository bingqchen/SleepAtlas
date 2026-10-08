import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {Engine,pythonRound4} from '../dist/engine.js';
import {favoriteSettings,islandFavorites,validateFavorites} from '../dist/favorite-berries.js';
import {createLevelPreview} from '../dist/level-preview.js';
import {calculatedStats} from '../dist/pokemon-stats.js';
import {skillLevelOptions,resolveMainSkill,MEW_SKILLS} from '../dist/main-skills.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog),preview=createLevelPreview(catalog);
const make=name=>{const p=engine.species.get(name);return engine.analyze({species:name,level:60,nature:'Hardy',skillLevel:6,carrySize:35,displayedFrequencySeconds:3000,frequencySource:'recorded',subskills:['Helping Speed M','Helping Bonus','Berry Finding S','',''],ingredients:[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name),settings:{areaBonus:25,teamHelpingBonus:4}})};
const ex={...islandFavorites('greengrass-expert'),berries:['DURIN','GREPA','MAGO']},plain={berries:ex.berries,multiplier:2};
const parity=[];
const boundary=engine.validate({...make('BANETTE').build,level:51,subskills:['','','','',''],settings:{helpingFrequencyFactor:1.15}});assert.equal(engine.calculate(boundary).frequencySeconds,2690);parity.push(boundary);
for(const [name,factor]of [['SCEPTILE',.9],['RAICHU',1],['GARDEVOIR',1],['CHARIZARD',1.15]]){
 const saved=make(name),snapshot=JSON.stringify(saved),p=engine.species.get(name),b=saved.build;
 const view=preview(saved,null,{full:true,favoriteBerries:ex});assert.equal(view.build.settings.helpingFrequencyFactor,factor);
 // Helping Speed + own/team Helping Bonus still caps at .35 before island effects.
 const interval=level=>Math.floor(pythonRound4((1-.002*(level-1))*(1-.35))*(p.frequency*factor));
 assert.equal(view.current.frequencySeconds,interval(60));
 for(const forecast of view.forecasts)assert.equal(forecast.frequencySeconds,interval(forecast.level));
 if(factor!==1){assert.equal(view.build.displayedFrequencySeconds,calculatedStats(catalog,view.build).frequencySeconds);assert.equal(view.build.frequencySource,'calculated')}
 else assert.equal(view.build.displayedFrequencySeconds,3000);
 assert.deepEqual(view.current.ratings,engine.analyze(view.build).current.ratings);
 const temporary=preview(saved,80,{full:true,favoriteBerries:ex});assert.equal(temporary.current.frequencySeconds,interval(80));
 assert.equal(JSON.stringify(saved),snapshot);assert.equal(preview(saved,null),saved);
 assert.equal(preview(saved,null,{favoriteBerries:plain}).build.displayedFrequencySeconds,3000);
 parity.push(view.build);
}
for(const [favoriteSpeed,nonFavoriteSpeed]of [[0,0],[50,-50],[-50,50],[25,-20]]){
 const cfg=validateFavorites({...ex,island:'custom',favoriteSpeed,nonFavoriteSpeed},catalog);
 assert.equal(favoriteSettings(make('SCEPTILE').build,catalog,cfg).helpingFrequencyFactor,1-favoriteSpeed/100);
 assert.equal(favoriteSettings(make('RAICHU').build,catalog,cfg).helpingFrequencyFactor,1);
 assert.equal(favoriteSettings(make('CHARIZARD').build,catalog,cfg).helpingFrequencyFactor,1-nonFavoriteSpeed/100);
}
for(const bad of [NaN,Infinity,'10',true,51,-51])assert.throws(()=>validateFavorites({...ex,island:'custom',favoriteSpeed:bad},catalog));
assert.throws(()=>validateFavorites({...ex,favoriteSpeed:20},catalog));
assert.equal(validateFavorites({berries:ex.berries,multiplier:2,island:'greengrass-expert'},catalog).favoriteSpeed,10,'Older Expert preference receives current speed defaults');
assert.equal(favoriteSettings(make('SCEPTILE').build,catalog,islandFavorites('greengrass')).helpingFrequencyFactor,1);
const cyan={...islandFavorites('cyan-expert'),berries:['ORAN','GREPA','MAGO']};
assert.equal(favoriteSettings(make('BLASTOISE').build,catalog,cyan).helpingFrequencyFactor,.8);
assert.equal(favoriteSettings(make('SCEPTILE').build,catalog,cyan).helpingFrequencyFactor,1.35);
const py=spawnSync('python3',['-c','import json,sys,analysis_engine as e; print(json.dumps([e.calculate(e.validate_build(b)) for b in json.load(sys.stdin)]))'],{cwd:new URL('../../',import.meta.url),input:JSON.stringify(parity),encoding:'utf8'});assert.equal(py.status,0,py.stderr);
JSON.parse(py.stdout).forEach((p,i)=>{const c=engine.calculate(parity[i]);assert.equal(p.frequencySeconds,c.frequencySeconds);assert.ok(Math.abs(p.strength-c.strength)<1e-7)});
for(const p of catalog.species){const levels=skillLevelOptions(catalog,{species:p.name});assert.deepEqual(levels,Array.from({length:p.skill.RP.length},(_,i)=>i+1))}
for(const mainSkill of MEW_SKILLS){const b={species:'MEW',mainSkill},levels=skillLevelOptions(catalog,b);assert.equal(levels.at(-1),resolveMainSkill(catalog,b).skill.RP.length)}
assert.deepEqual(skillLevelOptions(catalog,{species:'UNKNOWN'}),[]);assert.equal(skillLevelOptions(catalog,{species:'MEW',mainSkill:'Berry Burst'}).at(-1),6);
// Test actual picker builder, independent of home filters/sort and record order.
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const records=['GARDEVOIR','RAICHU','CHARIZARD','SCEPTILE'].map(id=>({id,analysis:make(id)}));
const ctx=vm.createContext({records,catalog,levelOverride:70,favoriteBerryConfig:ex,levelPreview:preview,berryTeamFor:()=>({berryTeam:null}),fmt:String,species:n=>engine.species.get(n)});
vm.runInContext(source.slice(source.indexOf('function teammateChoices('),source.indexOf('function openBerryTeam(')),ctx);
const choices=vm.runInContext("teammateChoices('SCEPTILE')",ctx);assert.equal(choices.length,3);for(let i=1;i<choices.length;i++)assert.ok((choices[i-1].rp??-Infinity)>=(choices[i].rp??-Infinity));assert.ok(choices.every(c=>c.label.includes('Lv. 70 · RP ')));
console.log('Passed: main/sub/nonfavorite intervals, custom bounds, legacy presets, Python parity, cap ordering, current/forecast/rating/temporary frequency, unchanged saved stats, valid levels for all species/Mew effects, and highest-RP teammate picker.');
