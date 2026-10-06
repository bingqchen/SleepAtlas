import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Engine,MODEL_VERSION} from '../dist/engine.js';
import {projectAnalysis} from '../dist/local-api.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const engine=new Engine(catalog),p=engine.species.get('GARDEVOIR');
const build=engine.validate({species:p.name,nickname:'Future helper',level:60,nature:'Hardy',skillLevel:6,carrySize:29,
  subskills:['Ingredient Finder M','Skill Trigger M','Skill Trigger S','Inventory Up S','Helping Speed M'],
  ingredients:[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name)});
for(const [level,expected] of [[13,[30,60,70,80]],[30,[60,70,80]],[60,[70,80]],[69,[70,80]],[70,[80]],[79,[80]],[80,[]],[100,[]]]){
  assert.deepEqual(engine.analyze({...build,level}).forecasts.map(f=>f.level),expected);
}
const analysis=engine.analyze(build),[at70,at80]=analysis.forecasts;
assert.ok(!analysis.current.activeSubskills.includes('Inventory Up S'));
assert.ok(at70.activeSubskills.includes('Inventory Up S'));
assert.ok(!at70.activeSubskills.includes('Helping Speed M'));
assert.ok(at80.activeSubskills.includes('Helping Speed M'));
const inventoryBonus=catalog.subskills.find(s=>s.name==='Inventory Up S').amount;
for(const forecast of analysis.forecasts){
  // Projecting from Lv.60 must equal that future build with its newly unlocked
  // inventory bonus recorded, without applying the bonus a second time.
  assert.deepEqual(forecast,engine.calculate({...build,level:forecast.level,carrySize:build.carrySize+inventoryBonus}));
  for(const key of ['skillTriggers','ingredientCount','berryCount','strength'])assert.ok(Number.isFinite(forecast[key])&&forecast[key]>0);
  const withoutUnlock=engine.calculate({...build,subskills:build.subskills.map((s,i)=>i===3?'':s)},forecast.level);
  assert.ok(forecast.normalHelps>withoutUnlock.normalHelps,'New carry capacity must affect the future output');
}
assert.ok(at80.frequencySeconds<engine.calculate({...build,subskills:build.subskills.map((s,i)=>i===4?'':s)},80).frequencySeconds);
assert.equal(analysis.build.skillLevel,6,'Forecasts preserve the displayed main skill level');

const old={...analysis,modelVersion:'atlas-1.3-web',forecasts:[]},snapshot=structuredClone(old);
const refreshed=projectAnalysis(old,catalog,engine);
assert.equal(refreshed.modelVersion,MODEL_VERSION);
assert.deepEqual(refreshed.forecasts.map(f=>f.level),[70,80]);
assert.deepEqual(refreshed.current,old.current,'Existing current-level output must stay unchanged');
assert.deepEqual(old,snapshot,'Read-time projection must not mutate the saved analysis');
assert.equal(projectAnalysis(refreshed,catalog,engine),refreshed);
console.log('Passed: future-level boundaries, Lv.70/80 unlocks and output, inventory adjustment, fixed main skill level and existing-analysis refresh.');
