import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Engine} from '../dist/engine.js';
import {createLevelPreview} from '../dist/level-preview.js';
import {FAVORITE_ISLANDS,islandFavorites,validateFavorites,favoriteSkillTriggerMultiplier,describeFavorites,berryOptions} from '../dist/favorite-berries.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog),preview=createLevelPreview(catalog);
const make=name=>{const p=engine.species.get(name);return engine.analyze({species:name,level:30,nature:'Gentle',skillLevel:3,carrySize:35,subskills:['Skill Trigger M','Skill Trigger S','Berry Finding S','',''],ingredients:[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name)})};
const ex={...islandFavorites('greengrass-expert'),berries:['DURIN','GREPA','MAGO']},boost={...ex,skillTriggerMultiplier:1.25};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const [name,multiplier] of [['SCEPTILE',1.25],['RAICHU',1.25],['GARDEVOIR',1.25],['CHARIZARD',1]]){
  const saved=make(name),snapshot=structuredClone(saved),plain=preview(saved,null,{favoriteBerries:ex}),summary=preview(saved,null,{favoriteBerries:boost}),full=preview(saved,null,{full:true,favoriteBerries:boost});
  const context={mainSkillLevelBonus:name==='SCEPTILE'?1:0,skillTriggerMultiplier:multiplier};
  assert.equal(favoriteSkillTriggerMultiplier(saved.build,catalog,boost),multiplier);
  close(summary.current.skillRate,plain.current.skillRate*multiplier);assert.equal(summary.current.skillTriggerMultiplier,multiplier);
  assert.equal(summary.current.strength,full.current.strength);assert.equal(summary.current.skillTriggers,full.current.skillTriggers);
  assert.equal(full.current.rp,saved.current.rp);assert.equal(full.build.skillLevel,3);
  for(const key of ['ingredientCount','ingredientRate','gatheredBerryCount','frequencySeconds'])assert.equal(full.current[key],plain.current[key]);
  assert.equal(full.current.mainSkillLevel,plain.current.mainSkillLevel,'Trigger and +1 level bonuses stay independent');
  assert.deepEqual(full.current.ratings,engine.analyze(full.build,context).current.ratings);
  assert.deepEqual(full.ingredientAlternatives,engine.analyze(full.build,context).ingredientAlternatives);
  for(const forecast of full.forecasts){const expected=engine.calculate(full.build,forecast.level,context);assert.equal(forecast.skillRate,expected.skillRate);assert.equal(forecast.strength,expected.strength)}
  if(multiplier>1){assert.ok(full.current.skillTriggers>plain.current.skillTriggers);assert.ok(full.current.skillTriggers<plain.current.skillTriggers*1.25,'Banking is nonlinear');if(name!=='GARDEVOIR')assert.ok(full.current.strength>plain.current.strength)}
  else assert.equal(full.current.strength,plain.current.strength);
  for(const level of [25,30,50,60,70,80]){
    const base=preview(saved,level,{favoriteBerries:ex}),view=preview(saved,level,{favoriteBerries:boost});
    close(view.current.skillRate,base.current.skillRate*multiplier);assert.equal(view.current.rp,base.current.rp);
    assert.equal(preview(saved,level,{favoriteBerries:ex}).current.skillTriggers,base.current.skillTriggers,'Toggling the cache resets the bonus');
  }
  assert.equal(preview(saved,null),saved);assert.deepEqual(saved,snapshot);
}
// Mew's selected effect and assumed rate are boosted, capped before banking;
// RP uses its unmodified assumption even at the probability boundary.
const mew={...make('MEW').build,mainSkill:'Berry Burst',mewSkillChance:90};
const m=engine.calculate(mew,30,{skillTriggerMultiplier:1.25,mainSkillLevelBonus:1});
assert.equal(m.skillRate,.999999);assert.ok(Number.isFinite(m.skillTriggers));assert.equal(m.mainSkillLevel,4);
assert.equal(m.rp,engine.calculate(mew).rp);
const moderate={...mew,mewSkillChance:4};close(engine.calculate(moderate,30,{skillTriggerMultiplier:1.25}).skillRate,engine.calculate(moderate).skillRate*1.25);
for(const id of ['greengrass-expert','cyan-expert']){
  const cfg={...islandFavorites(id),berries:['DURIN']};
  assert.equal(favoriteSkillTriggerMultiplier(make('SCEPTILE').build,catalog,cfg),1,'Existing EX preferences do not opt in');
  assert.equal(validateFavorites({...cfg,skillTriggerMultiplier:1.25},catalog).skillTriggerMultiplier,1.25);
}
const build=make('SCEPTILE').build;
assert.equal(favoriteSkillTriggerMultiplier(build,catalog,null),1);
assert.equal(favoriteSkillTriggerMultiplier(build,catalog,{...boost,berries:[]}),1);
assert.equal(favoriteSkillTriggerMultiplier(build,catalog,{...boost,berries:['MAGO']}),1);
assert.equal(favoriteSkillTriggerMultiplier(build,catalog,{...boost,island:'custom'}),1.25);
assert.equal(validateFavorites({...boost,multiplier:2.4},catalog).skillTriggerMultiplier,1.25,'Explicit event stacking remains possible');
assert.match(describeFavorites(boost,catalog),/All favorite types: 1.25× skill trigger chance/);
for(const id of ['greengrass','lapis'])assert.throws(()=>validateFavorites({...islandFavorites(id),skillTriggerMultiplier:1.25},catalog));
for(const bad of [0,1.2,1.5,'1.25',true,null,NaN,Infinity]){assert.throws(()=>validateFavorites({...boost,skillTriggerMultiplier:bad},catalog));assert.throws(()=>engine.calculate(build,30,{skillTriggerMultiplier:bad}))}
// Exercise the actual UI draft, reset, Custom preservation, and submission.
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
assert.match(html,/id="favorite-skill-trigger"[^>]*>.*value="1.25">1.25×/);
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,options:[],textContent:'',showModal(){}});return nodes.get(id)};
const ctx=vm.createContext({$:node,catalog,FAVORITE_ISLANDS,islandFavorites,berryOptions,options:()=>'',favoriteBerryConfig:boost,closeActions(){},toast(){},applyFavoriteBerries:c=>ctx.applied=c});
vm.runInContext(source.slice(source.indexOf('function openFavoriteBerries('),source.indexOf('async function applyFavoriteBerries(')),ctx);
node('favorite-island').value='greengrass-expert';vm.runInContext('openFavoriteBerries()',ctx);assert.equal(node('favorite-skill-trigger').value,1.25);assert.equal(node('favorite-skill-trigger').disabled,false);
node('favorite-island').value='custom';vm.runInContext('selectFavoriteIsland()',ctx);assert.equal(node('favorite-skill-trigger').value,1.25);
node('favorite-island').value='greengrass';vm.runInContext('selectFavoriteIsland()',ctx);assert.equal(node('favorite-skill-trigger').value,1);assert.equal(node('favorite-skill-trigger').disabled,true);
node('favorite-island').value='cyan-expert';vm.runInContext('selectFavoriteIsland()',ctx);assert.equal(node('favorite-skill-trigger').value,1);assert.equal(node('favorite-skill-trigger').disabled,false);
node('favorite-skill-trigger').value='1.25';node('favorite-berry-0').value='ORAN';node('favorite-berry-1').value='DURIN';
vm.runInContext(source.slice(source.indexOf("$('favorite-berries-form').onsubmit="),source.indexOf("$('reset-favorite-berries').onclick=")),ctx);
node('favorite-berries-form').onsubmit({preventDefault(){}});assert.equal(ctx.applied.skillTriggerMultiplier,1.25);assert.equal(validateFavorites(ctx.applied,catalog).skillTriggerMultiplier,1.25);
console.log('Passed: all three favorites, EX opt-in/default/reset, nonfavorites, Mew caps, nonlinear banking, main-skill-level composition, RP invariance, previews/references/forecasts/cache and actual UI controls.');
