import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ingredientDescriptor,ingredientRegions,resolveIngredients} from '../dist/ingredient-matcher.js';
import {rankSprites,confidentMatch} from '../dist/sprite-matcher.js';
import {parseOCR,isFrequencyLine} from '../dist/ocr-parser.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),refs=JSON.parse(fs.readFileSync(new URL('../dist/ingredient-features.json',import.meta.url)));
const sceptile=catalog.species.find(p=>p.name==='SCEPTILE');
const gardevoir=catalog.species.find(p=>p.name==='GARDEVOIR');
const dratini=catalog.species.find(p=>p.name==='DRATINI');
const appleHits=[{slot:1,ingredient:'Apple',amount:2},{slot:2,ingredient:'Apple',amount:4}];
assert.deepEqual(resolveIngredients(appleHits,gardevoir).ingredients,['','Apple','Apple']);
const lines=[{text:'Every 28 mins 36 secs',x:.43,y:.193,w:.39,h:.016,confidence:.99},...[.544,.711,.876].map((x,i)=>({text:`×${i?2:1}`,x:x-.011,y:.148,w:.022,h:.007,confidence:.9}))];
const regions=ingredientRegions(lines,1320,2868);assert.deepEqual(regions.map(r=>r.slot),[1,2]);
assert.deepEqual(ingredientRegions(lines.filter(l=>!l.text.startsWith('Every')),1320,2868),[]);
assert.deepEqual(ingredientRegions(lines.slice(0,1).concat(lines.slice(2,3)),1320,2868),[]);
assert.deepEqual(ingredientRegions(lines.map((l,i)=>i===2?{...l,y:.8}:i===3?{...l,y:.9}:l),1320,2868),[]);
const stats=[lines[0],{text:'39',x:.434,y:.25,w:.04,h:.013},{text:'Main Skill & Sub Skills',x:.10,y:.328,w:.37,h:.012}];
assert.deepEqual(ingredientRegions(stats,1320,2868).map(r=>r.slot),[1,2]);
assert.deepEqual(ingredientRegions(stats.slice(0,2),1320,2868),[]);
for(const duration of ['1 hr 13 mins 12 secs','1 h 13 m 12 s','1 hour 13 minutes 12 seconds','2 hrs 4 mins 5 secs','45 secs']){
  const hourly=[{...stats[0],text:`Every ${duration}`},...stats.slice(1)];
  assert.ok(isFrequencyLine(hourly[0]));
  assert.deepEqual(ingredientRegions(hourly,1320,2868).map(r=>r.slot),[1,2]);
  assert.equal(parseOCR([{lines:hourly}],catalog).fields.carrySize,39);
}
assert.equal(isFrequencyLine({text:'Every 10 helpers'}),false);
const names=new Set(refs.entries.map(e=>e.species));
for(const p of catalog.species)for(const key of ['ingredient0','ingredient30','ingredient60'])for(const o of p[key])assert.ok(names.has(o.ingredient.name));
for(const entry of refs.entries){const d=Uint8Array.from(atob(entry.pixels),v=>v.charCodeAt(0)),noise=d.map((v,i)=>Math.min(255,Math.max(0,v+(i%5)-2)));assert.equal(confidentMatch(rankSprites(noise,refs.entries)),entry.species)}
const blank={data:new Uint8Array(100*100*4).fill(245),width:100,height:100};assert.equal(ingredientDescriptor(blank),null);
assert.equal(confidentMatch(rankSprites(new Uint8Array(24*24*3).fill(255),refs.entries)),null);
const hits=[{slot:1,ingredient:'Coffee',amount:2},{slot:2,ingredient:'Leek',amount:2}];
assert.deepEqual(resolveIngredients(hits,sceptile).ingredients,['','Coffee','Leek']);
assert.deepEqual(resolveIngredients(hits.map(h=>({...h,amount:null})),sceptile).ingredients,['','Coffee','Leek']);
assert.deepEqual(resolveIngredients(hits,undefined).ingredients,['','','']);
assert.deepEqual(resolveIngredients([...hits,{slot:1,ingredient:'Egg',amount:2}],sceptile).ingredients,['','','Leek']);
assert.deepEqual(resolveIngredients([{slot:1,ingredient:'Coffee',amount:5},{slot:2,ingredient:'Corn',amount:2}],sceptile).ingredients,['','','']);
assert.deepEqual(resolveIngredients([{slot:1,ingredient:null,amount:2}],sceptile).ingredients,['','','']);
const candidate=(species,score)=>({species,score});
const contextual=candidates=>({slot:2,ingredient:null,amount:8,candidates});
const paleOil=contextual([candidate('Oil',.004),candidate('Milk',.006),candidate('Corn',.028),candidate('Herb',.044)]);
assert.deepEqual(resolveIngredients([paleOil],dratini).ingredients,['','','Oil']);
for(const candidates of [
  [candidate('Milk',.003),candidate('Oil',.004),candidate('Corn',.028)],
  [candidate('Oil',.004),candidate('Corn',.006)],
  [candidate('Oil',.004),candidate('Milk',.006)],
  [candidate('Oil',.022),candidate('Corn',.04)],
  [candidate('Oil',.018),candidate('Corn',.024)]
])assert.deepEqual(resolveIngredients([contextual(candidates)],dratini).ingredients,['','','']);
assert.deepEqual(resolveIngredients([{...paleOil,amount:7}],dratini).ingredients,['','','']);
assert.deepEqual(resolveIngredients([paleOil,{slot:2,ingredient:'Corn',amount:4}],dratini).ingredients,['','','']);
assert.deepEqual(resolveIngredients([paleOil],undefined).ingredients,['','','']);
for(const rgb of [[255,255,255],[245,245,210],[220,220,220],[190,190,190]]){
  const data=new Uint8Array(83*59*4);for(let i=0;i<83*59;i++)data.set([...rgb,255],i*4);
  const candidates=rankSprites(ingredientDescriptor({data,width:83,height:59}),refs.entries);
  for(const p of [dratini,sceptile,gardevoir])assert.deepEqual(resolveIngredients([contextual(candidates)],p).ingredients,['','',''],'Blank crops must not become ingredient guesses');
}
const locked=refs.entries.find(e=>e.species==='Locked');
const lockedCandidates=rankSprites(Uint8Array.from(atob(locked.pixels),c=>c.charCodeAt(0)),refs.entries);
assert.equal(lockedCandidates[0].species,'Locked');
assert.deepEqual(resolveIngredients([contextual(lockedCandidates)],dratini).ingredients,['','','']);
// Real OCR coordinates and compact icon descriptors, without full screenshots.
for(const fixture of JSON.parse(fs.readFileSync(new URL('ingredient-regressions.json',import.meta.url)))){
  const regions=ingredientRegions(fixture.lines,fixture.width,fixture.height);
  assert.deepEqual(regions,fixture.slots.map(s=>s.region));
  assert.equal(parseOCR([{lines:fixture.lines}],catalog).fields.carrySize,fixture.carrySize);
  const matches=fixture.slots.map(s=>{const candidates=rankSprites(Uint8Array.from(atob(s.pixels),c=>c.charCodeAt(0)),refs.entries);return {...s.region,candidates,ingredient:confidentMatch(candidates)}});
  const resolved=resolveIngredients(matches,catalog.species.find(p=>p.name===fixture.species));
  for(const s of fixture.slots)assert.equal(resolved.ingredients[s.region.slot],s.ingredient,`${fixture.species} slot ${s.region.slot}`);
}
console.log('Passed: all ingredient references, faded variants, noisy matches, blank rejection, crop anchors, missing anchors, species/quantity validation, and conflicting screenshots.');
