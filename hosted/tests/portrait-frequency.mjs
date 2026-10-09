import fs from 'node:fs';
import assert from 'node:assert/strict';
import {rankSprites,confidentMatch,confidentSpriteMatch,contextualSpriteMatch} from '../dist/sprite-matcher.js';
import {parseOCR} from '../dist/ocr-parser.js';
import {assessImport,confidentHeaderLevels,speciesWithMatchingFrequency} from '../dist/import-review.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const fixture=read('blissey-portrait-sensitivity.json'),catalog=read('../dist/catalog.json'),sprites=read('../dist/sprite-features.json'),ingredients=read('../dist/ingredient-features.json');
const rank=(pixels,refs)=>rankSprites(Buffer.from(pixels,'base64'),refs.entries);
const evidence=fixture.cases.map(photo=>{
  const lines=[...photo.lines,...photo.targetedRecovery.flatMap(c=>c.lines)];
  const ranked=rank(photo.portrait.pixels,sprites);
  const icons=photo.ingredients.map(icon=>({...icon,ingredient:confidentMatch(rank(icon.pixels,ingredients))}));
  assert.equal(confidentSpriteMatch(ranked),null,'Compressed pale portrait must fail the unchanged visual threshold');
  assert.deepEqual(icons.map(i=>i.ingredient),['Egg','Egg']);
  assert.deepEqual(confidentHeaderLevels([{lines}]),photo.expectedStrongHeaderLevels);
  return {photo,lines,ranked,icons};
});
const good=evidence[0],match=(lines=good.lines,ranked=good.ranked,icons=good.icons)=>contextualSpriteMatch(ranked,lines,icons,catalog);
assert.equal(match(),'BLISSEY','Known level and interval distinguish Blissey from compatible evolutions');
const result=parseOCR([{lines:good.lines}],catalog);result.fields.species=match();result.fields.ingredients=['Egg','Egg','Egg'];
assert.equal(assessImport(result,[{lines:good.lines,passes:good.photo.passes}],catalog,{pictureSpecies:match()}).ready,true,'Actual compressed screenshot now qualifies for auto-save');
const small=evidence[1];
assert.equal(match(small.lines,small.ranked,small.icons),null,'A weak level cannot be inferred from speed and then reused to identify a weak portrait');
const q50=rank(fixture.negativePortrait.pixels,sprites);
assert.equal(q50[0].species,'CHANSEY');assert.equal(confidentSpriteMatch(q50),null);
assert.equal(match(good.lines,q50),null,'Stats cannot promote Blissey from below the best portrait candidate');
const line=(text,x=.22,y=.11)=>({text,x,y,w:.2,h:.014,confidence:.96});
for(const marker of ['Lv.61','Bashful','Every','Inventory Up L']){
  const uncertain=good.lines.map(l=>l.text.includes(marker)?{...l,confidence:.4,words:(l.words||[]).map(w=>({...w,confidence:.4}))}:l);
  assert.equal(match(uncertain),null,`Uncertain ${marker} must not disambiguate the portrait`);
}
for(const extra of [line('Lv.62'),line('Every 46 mins 0 secs',.44,.21),line('Brave',.2,.85),line('Good-Night Ribbon',.2,.93),line('Skill Trigger S',.16,.55)])assert.equal(match([...good.lines,extra]),null,'Conflicting stats or unmodeled modifiers require review');
assert.equal(match(good.lines,good.ranked,good.icons.slice(0,1)),null,'Both ingredient icons remain required');
assert.equal(match(good.lines,good.ranked,good.icons.map(i=>({...i,amount:99}))),null,'Illegal quantities cannot support identification');
assert.equal(match(good.lines,[{species:'BLISSEY',score:.021}]),null,'A bad picture match cannot be rescued by stats');
const blissey=catalog.species.find(p=>p.name==='BLISSEY');
assert.equal(speciesWithMatchingFrequency([blissey,{...blissey,name:'TEST_SAME_STATS'}],[{lines:good.lines}],catalog).length,1,'Unknown catalog species cannot acquire a frequency');
console.log('Passed: compressed Blissey recovery with independently clear level, Egg icons and frequency; weak levels, conflicting stats, missing evidence and wrong best portraits remain reviewable.');
