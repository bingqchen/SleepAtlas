import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Engine} from '../dist/engine.js';
import {createLevelPreview} from '../dist/level-preview.js';
import {FAVORITE_ISLANDS,islandFavorites,validateFavorites,favoriteSkillLevelBonus,describeFavorites,berryOptions} from '../dist/favorite-berries.js';
import {resolveMainSkill,MEW_SKILLS} from '../dist/main-skills.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog),preview=createLevelPreview(catalog);
const make=(name,skillLevel=2)=>{const p=engine.species.get(name);return engine.analyze({species:name,level:30,nature:'Hardy',skillLevel,carrySize:35,subskills:['Skill Level Up M','Helping Speed M','Berry Finding S','',''],ingredients:[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name)})};
const ex={...islandFavorites('greengrass-expert'),berries:['DURIN','GREPA','MAGO']};
const noBonus={...ex,island:'custom',mainSkillLevelBonus:0};
for(const [name,expected] of [['SCEPTILE',1],['RAICHU',0],['GARDEVOIR',0],['CHARIZARD',0]]){
  const saved=make(name),snapshot=structuredClone(saved);
  assert.equal(favoriteSkillLevelBonus(saved.build,catalog,ex),expected);
  const summary=preview(saved,null,{favoriteBerries:ex}),full=preview(saved,null,{full:true,favoriteBerries:ex}),base=preview(saved,null,{full:true,favoriteBerries:noBonus});
  assert.equal(summary.current.mainSkillLevel,2+expected);assert.equal(full.current.mainSkillLevelBonus,expected);
  assert.equal(summary.current.strength,full.current.strength);assert.equal(summary.current.rp,saved.current.rp);
  assert.equal(full.build.skillLevel,2);assert.equal(full.current.skillTriggers,base.current.skillTriggers);
  assert.equal(full.current.rp,base.current.rp);assert.deepEqual(full.current.ratings,engine.analyze(full.build,{mainSkillLevelBonus:expected}).current.ratings);
  for(const forecast of full.forecasts){assert.equal(forecast.mainSkillLevel,2+expected);assert.equal(forecast.strength,engine.calculate(full.build,forecast.level,{mainSkillLevelBonus:expected}).strength)}
  assert.deepEqual(full.ingredientAlternatives,engine.analyze(full.build,{mainSkillLevelBonus:expected}).ingredientAlternatives);
  if(expected){assert.ok(full.current.skillBerryCount>base.current.skillBerryCount);assert.ok(full.current.strength>base.current.strength)}
  else assert.equal(full.current.strength,base.current.strength);
  for(const level of [25,30,50,60,70,80]){
    const view=preview(saved,level,{favoriteBerries:ex});assert.equal(view.current.mainSkillLevel,2+expected);assert.equal(view.build.skillLevel,2);
    assert.equal(view.current.rp,preview(saved,level,{favoriteBerries:noBonus}).current.rp);
    assert.equal(preview(saved,level,{favoriteBerries:ex}).current.mainSkillLevel,2+expected);
  }
  assert.equal(preview(saved,null),saved);assert.deepEqual(saved,snapshot);
}
// Every species and each Mew effect cap at its own skill maximum, including
// legacy Mew levels above the selected effect's cap. Editor/RP default is zero.
for(const p of catalog.species){
  for(const level of [1,p.skill.RP.length]){
    const b={species:p.name,skillLevel:level},plain=resolveMainSkill(catalog,b),boost=resolveMainSkill(catalog,b,{levelBonus:1});
    assert.equal(boost.effectiveLevel,Math.min(level+1,p.skill.RP.length));assert.equal(plain.effectiveLevel,level);
  }
}
for(const mainSkill of MEW_SKILLS){
  const b={...make('MEW').build,mainSkill},max=resolveMainSkill(catalog,b).skill.RP.length;
  for(const level of [max-1,max,8])assert.equal(resolveMainSkill(catalog,{...b,skillLevel:level},{levelBonus:1}).effectiveLevel,Math.min(level+1,max));
  const plain=engine.calculate(b),boost=engine.calculate(b,b.level,{mainSkillLevelBonus:1});assert.equal(plain.rp,boost.rp);
}
const unresolved=make('MEW');assert.equal(engine.calculate(unresolved.build,30,{mainSkillLevelBonus:1}).rp,null);
assert.equal(engine.calculate(unresolved.build,30,{mainSkillLevelBonus:1}).skillStrength,0);
const burst=make('SCEPTILE',5),berryBoost=engine.calculate(burst.build,30,{mainSkillLevelBonus:1});
assert.equal(berryBoost.skillBerriesPerTrigger,30);assert.equal(berryBoost.teamBerriesPerTrigger,20);
const capped=engine.calculate({...burst.build,skillLevel:6},30,{mainSkillLevelBonus:1});assert.equal(capped.mainSkillLevel,6);assert.equal(capped.mainSkillLevelBonus,0);
const raichu=make('RAICHU'),r=engine.calculate(raichu.build,30,{mainSkillLevelBonus:1});
assert.equal(r.skillStrength,r.skillTriggers*engine.species.get('RAICHU').skill.strengthAmounts[2]);
const blastoise=make('BLASTOISE'),b=engine.calculate(blastoise.build,30,{mainSkillLevelBonus:1});
assert.equal(b.randomIngredients,b.skillTriggers*engine.species.get('BLASTOISE').skill.ingredientAmounts[2]);
for(const id of ['greengrass-expert','cyan-expert']){
  const old={berries:['DURIN'],multiplier:2,island:id};assert.equal(validateFavorites(old,catalog).mainSkillLevelBonus,1);
  assert.match(describeFavorites(old,catalog),/main skill \+1 level/);
  assert.equal(favoriteSkillLevelBonus(burst.build,catalog,old),1);
  assert.equal(favoriteSkillLevelBonus(burst.build,catalog,{...old,berries:[]}),0);
  assert.throws(()=>validateFavorites({...old,mainSkillLevelBonus:0},catalog));
}
assert.equal(favoriteSkillLevelBonus(burst.build,catalog,islandFavorites('lapis')),0);
assert.equal(favoriteSkillLevelBonus(burst.build,catalog,islandFavorites('greengrass')),0);
assert.equal(favoriteSkillLevelBonus(burst.build,catalog,null),0);
assert.equal(favoriteSkillLevelBonus(burst.build,catalog,{berries:['DURIN'],multiplier:2}),0);
for(const bad of [-1,2,true,'1',NaN]){assert.throws(()=>validateFavorites({...ex,island:'custom',mainSkillLevelBonus:bad},catalog));assert.throws(()=>resolveMainSkill(catalog,burst.build,{levelBonus:bad}))}
// Exercise actual island draft controls and submission, preserving DOM IDs.
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
assert.match(html,/id="favorite-berries-button"[^>]*>Select island<\/button>/);assert.match(html,/id="favorite-berries-title">Select island/);
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,options:[],textContent:'',showModal(){}});return nodes.get(id)};
const ctx=vm.createContext({$:node,catalog,FAVORITE_ISLANDS,islandFavorites,berryOptions,options:()=>'',favoriteBerryConfig:ex,closeActions(){},toast(){},applyFavoriteBerries:c=>ctx.applied=c});
vm.runInContext(source.slice(source.indexOf('function openFavoriteBerries('),source.indexOf('async function applyFavoriteBerries(')),ctx);
node('favorite-island').value='greengrass-expert';vm.runInContext('openFavoriteBerries()',ctx);assert.equal(node('favorite-skill-level').value,1);assert.equal(node('favorite-skill-level').disabled,true);
node('favorite-island').value='custom';vm.runInContext('selectFavoriteIsland()',ctx);assert.equal(node('favorite-skill-level').value,1);assert.equal(node('favorite-skill-level').disabled,false);
node('favorite-island').value='greengrass';vm.runInContext('selectFavoriteIsland()',ctx);assert.equal(node('favorite-skill-level').value,0);assert.equal(node('favorite-speed').value,0);
vm.runInContext(source.slice(source.indexOf("$('favorite-berries-form').onsubmit="),source.indexOf("$('reset-favorite-berries').onclick=")),ctx);
node('favorite-island').value='custom';node('favorite-skill-level').value='1';node('favorite-speed').value='0';node('non-favorite-speed').value='0';node('favorite-berry-1').value='DURIN';node('favorite-berry-multiplier').value='2';
node('favorite-berries-form').onsubmit({preventDefault(){}});assert.equal(ctx.applied,undefined);assert.match(node('favorite-berries-status').textContent,/first berry slot/);
node('favorite-berry-0').value='MAGO';node('favorite-berries-form').onsubmit({preventDefault(){}});assert.equal(ctx.applied.mainSkillLevelBonus,1);assert.deepEqual(Array.from(ctx.applied.berries),['MAGO','DURIN']);
console.log('Passed: primary-only EX skill boost, all species/Mew caps, RP invariance, production/reference/forecast/preview consistency, saved levels unchanged, preference migration and actual UI draft/submit behavior.');
