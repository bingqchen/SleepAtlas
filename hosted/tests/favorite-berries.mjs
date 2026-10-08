import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Engine,MODEL_VERSION} from '../dist/engine.js';
import {createLevelPreview} from '../dist/level-preview.js';
import {FAVORITE_ISLANDS,islandFavorites,berryOptions,validateFavorites,favoriteSettings,describeFavorites} from '../dist/favorite-berries.js';
import {collectionRows} from '../dist/collection.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog),preview=createLevelPreview(catalog);
const make=name=>{const p=engine.species.get(name);return engine.analyze({species:name,level:60,nature:'Hardy',skillLevel:6,carrySize:35,displayedFrequencySeconds:null,subskills:['Berry Finding S','Helping Speed M','Skill Trigger M','Inventory Up S','Skill Trigger S'],ingredients:[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name),settings:{areaBonus:25,favoriteBerry:true}})};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const ordinary={berries:[],multiplier:2.4},favorites={berries:['DURIN','GREPA','MAGO'],multiplier:2.4};
assert.equal(berryOptions(catalog).length,18);
assert.deepEqual(validateFavorites(favorites,catalog),favorites);assert.equal(validateFavorites(null,catalog),null);
for(const bad of [{berries:['MAGO','MAGO'],multiplier:2},{berries:['MAGO','GREPA','DURIN','ORAN'],multiplier:2},{berries:['UNKNOWN'],multiplier:2},{berries:[],multiplier:4},{berries:[],multiplier:'2.4'}])assert.throws(()=>validateFavorites(bad,catalog));
assert.match(describeFavorites(favorites,catalog),/Durin, Grepa, Mago.*2.4/);
assert.match(describeFavorites(ordinary,catalog),/No favorite berries/);
const expectedIslands={cyan:['ORAN','PECHA','PAMTRE'],taupe:['LEPPA','FIGY','SITRUS'],snowdrop:['RAWST','PERSIM','WIKI'],lapis:['DURIN','MAGO','CHERI'],'old-gold':['GREPA','BLUK','BELUE'],amber:['YACHE','LUM','CHESTO']};
for(const [island,berries] of Object.entries(expectedIslands)){
  const config=islandFavorites(island);assert.deepEqual(config,{berries,multiplier:2,island});assert.deepEqual(validateFavorites(config,catalog),config);
  for(const p of catalog.species){const settings=favoriteSettings({species:p.name,settings:catalog.defaults},catalog,config);assert.equal(settings.favoriteBerry,berries.includes(p.berry.name));assert.equal(settings.favoriteBerryMultiplier,2)}
  assert.throws(()=>validateFavorites({...config,multiplier:2.4},catalog));assert.throws(()=>validateFavorites({...config,berries:[]},catalog));
}
for(const island of ['greengrass','greengrass-expert','cyan-expert']){
  const speeds=island==='greengrass-expert'?{favoriteSpeed:10,nonFavoriteSpeed:-15,mainSkillLevelBonus:1}:island==='cyan-expert'?{favoriteSpeed:20,nonFavoriteSpeed:-35,mainSkillLevelBonus:1}:{};
  assert.deepEqual(islandFavorites(island),{berries:[],multiplier:2,island,...speeds});
  assert.deepEqual(validateFavorites({...favorites,island},catalog),{...favorites,island,...speeds});
}
assert.equal(FAVORITE_ISLANDS.length,10);
assert.throws(()=>islandFavorites('unknown'));assert.throws(()=>validateFavorites({...favorites,island:'unknown'},catalog));
const cloned=islandFavorites('cyan');cloned.berries.pop();assert.equal(islandFavorites('cyan').berries.length,3,'Drafts cannot mutate shared presets');
assert.match(describeFavorites(islandFavorites('cyan'),catalog),/^Cyan Beach.*Oran, Pecha, Pamtre.*2×/);
assert.match(describeFavorites(islandFavorites('greengrass'),catalog),/^Greengrass Isle.*ordinary strength/);

for(const name of ['SCEPTILE','RAICHU','GARDEVOIR','CHARIZARD']){
  const saved=make(name),snapshot=structuredClone(saved),match=favorites.berries.includes(engine.species.get(name).berry.name);
  const base=engine.analyze({...saved.build,settings:{...saved.build.settings,favoriteBerry:false}});
  for(const multiplier of [2,2.4]){
    const config={...favorites,multiplier},view=preview(saved,null,{full:true,favoriteBerries:config});
    const factor=match?multiplier:1;
    close(view.current.berryStrength,base.current.berryStrength*factor);close(view.current.skillBerryStrength,base.current.skillBerryStrength*factor);
    close(view.current.strength,base.current.berryStrength*factor+base.current.ingredientStrength+base.current.skillStrength);
    for(const key of ['berryCount','skillBerryCount','skillTriggers','ingredientCount','ingredientStrength','skillStrength'])close(view.current[key],base.current[key]);
    assert.equal(view.build.displayedFrequencySeconds,null);assert.equal(view.build.carrySize,saved.build.carrySize);
    assert.deepEqual(view.current.ratings,engine.analyze(view.build).current.ratings);
    for(const forecast of view.forecasts){const original=engine.calculate(base.build,forecast.level);close(forecast.berryStrength,original.berryStrength*factor)}
    for(const level of [25,60,70,80]){
      const projected=preview(saved,level,{full:true,favoriteBerries:config}),plain=preview(saved,level,{full:true,favoriteBerries:ordinary});
      close(projected.current.berryStrength,plain.current.berryStrength*factor);
      assert.equal(projected.build.level,level);
    }
  }
  close(preview(saved,null,{full:true,favoriteBerries:ordinary}).current.berryStrength,base.current.berryStrength);
  assert.equal(preview(saved,null),saved,'No global setting preserves legacy per-Pokémon favorites');assert.deepEqual(saved,snapshot);
  assert.equal(favoriteSettings(saved.build,catalog,null),saved.build.settings);
}
const boosted=engine.validate({...make('SCEPTILE').build,settings:{favoriteBerry:true,favoriteBerryMultiplier:2.4}});
assert.equal(boosted.settings.favoriteBerryMultiplier,2.4);
for(const multiplier of [1,0,2.2,'2',null,true])assert.throws(()=>engine.validate({...boosted,settings:{favoriteBerryMultiplier:multiplier}}));
const rows=['SCEPTILE','CHARIZARD','RAICHU'].map(id=>({id,analysis:preview(make(id),70,{full:true,favoriteBerries:favorites})}));
const sorted=collectionRows(rows,catalog.species,{sort:'strength'});assert.ok(sorted[0].analysis.current.strength>=sorted[1].analysis.current.strength);

// Use an isolated IndexedDB for actual preference writes and Pokémon records.
await import(process.argv[2]);globalThis.fetch=async()=>new Response(JSON.stringify(catalog));
const {api,database}=await import('../dist/local-api.js');
const cacheDB=await new Promise((resolve,reject)=>{const r=indexedDB.open('favorite-preference-test',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const original=make('SCEPTILE');const {id}=await api('/api/pokemon',{method:'POST',body:JSON.stringify({build:original.build})});
const before=await api('/api/pokemon/'+id),backup=await api('/api/backup');
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,open:true,close(){this.open=false}});return nodes.get(id)};
node('favorite-berries-form').elements=[{disabled:false},{disabled:true}];
const messages=[];let rendered=0;
const ctx=vm.createContext({$:node,catalog,cacheDB:Promise.resolve(cacheDB),validateFavorites,renderCollection(){rendered++},toast:m=>messages.push(m)});
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const apply=source.slice(source.indexOf('async function applyFavoriteBerries('),source.indexOf("$('favorite-berries-button').onclick="));
vm.runInContext('let savingFavorites=false,favoriteBerryConfig=null;'+apply,ctx);
ctx.configuration=favorites;await vm.runInContext('applyFavoriteBerries(configuration)',ctx);
const read=()=>new Promise((resolve,reject)=>{const r=cacheDB.transaction('cache').objectStore('cache').get('favorite-berries');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const reloaded=validateFavorites(await read(),catalog);assert.deepEqual(reloaded,favorites);assert.equal(rendered,1);assert.equal(node('favorite-berries-dialog').open,false);
assert.deepEqual(node('favorite-berries-form').elements.map(c=>c.disabled),[false,true]);
const afterReload=createLevelPreview(catalog)(before.analysis,null,{full:true,favoriteBerries:reloaded});
assert.equal(afterReload.modelVersion,MODEL_VERSION);close(afterReload.current.berryStrength,original.current.berryStrength*1.2);
assert.deepEqual(await api('/api/pokemon/'+id),before);assert.deepEqual((await api('/api/backup')).pokemon,backup.pokemon);
for(const configuration of [islandFavorites('cyan'),{...favorites,island:'greengrass'},islandFavorites('greengrass'),{...favorites,island:'custom',mainSkillLevelBonus:1}]){
  ctx.configuration=configuration;await vm.runInContext('applyFavoriteBerries(configuration)',ctx);
  assert.deepEqual(validateFavorites(await read(),catalog),configuration,'Island and manual settings survive storage/reload');
  const view=createLevelPreview(catalog)(before.analysis,null,{full:true,favoriteBerries:await read()});
  close(view.current.berryStrength,original.current.berryStrength*(configuration.berries.includes('DURIN')?configuration.multiplier/2:0.5));
  assert.deepEqual(await api('/api/pokemon/'+id),before);assert.deepEqual((await api('/api/backup')).pokemon,backup.pokemon);
}
await vm.runInContext('applyFavoriteBerries(null)',ctx);assert.equal(await read(),null);
ctx.configuration={berries:['MAGO','MAGO'],multiplier:2};await vm.runInContext('applyFavoriteBerries(configuration)',ctx);assert.equal(await read(),null);assert.match(node('favorite-berries-status').textContent,/different berry/);
cacheDB.close();(await database()).close();
console.log('Passed: fixed island presets, Greengrass/Expert defaults, legacy and island preference persistence, 18 berry types, max-three validation, 2×/2.4× matching and legacy behavior, no double bonuses, counts unchanged, skill berries, area bonus, ratings/forecasts/level composition, preference persistence/reset and untouched Pokémon backups/history.');
