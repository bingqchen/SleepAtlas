import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseOCR} from '../dist/ocr-parser.js';
import {assessImport} from '../dist/import-review.js';
import {portraitRegion,rankSprites,confidentSpriteMatch,contextualSpriteMatch} from '../dist/sprite-matcher.js';
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const catalog=read('../dist/catalog.json'),fixture=read('mewtwo-ocr-lines.json');
const result=parseOCR([fixture],catalog);result.fields.ingredients=['Soybean','Soybean','Corn'];
const assess=(r=result,images=[fixture],pictureSpecies='MEWTWO')=>assessImport(r,images,catalog,{pictureSpecies});
assert.equal(assess().ready,true,'Complete confidently read screenshot may auto-save');
assert.equal(assess(result,[fixture],null).ready,false,'A nickname that is a species name is insufficient');
assert.equal(assess(result,[fixture],'MEW').ready,false,'Conflicting portrait cannot auto-save');
for(const key of ['species','level','nature','skillLevel','carrySize','displayedFrequencySeconds']){
  const r=structuredClone(result);delete r.fields[key];assert.equal(assess(r).ready,false,key);
}
for(let i=0;i<5;i++){const r=structuredClone(result);r.fields.subskills[i]='';assert.equal(assess(r).ready,false)}
for(let i=0;i<3;i++){const r=structuredClone(result);r.fields.ingredients[i]='';assert.equal(assess(r).ready,false)}
const faint={lines:fixture.lines.map(l=>({...l,confidence:.5}))};assert.equal(assess(result,[faint]).ready,false);
for(const line of [
  {text:'Carry limit 42',x:.1,y:.26},
  {text:'Lv. 32 Mewtwo',x:.2,y:.1},
  {text:'Brave',x:.2,y:.85},
  {text:'Psystrike (Berry Zone) Lv. 5',x:.25,y:.4}
]){
  const image={lines:[...fixture.lines,{...line,h:.01,confidence:.99}]};
  const r=parseOCR([image],catalog);r.fields.ingredients=result.fields.ingredients;
  assert.equal(assess(r,[image]).ready,false,`Reject within-pass conflict: ${line.text}`);
}
const mareep=read('mareep-regression.json'),refs=read('../dist/sprite-features.json');
assert.deepEqual(portraitRegion(mareep.lines,mareep.width,mareep.height),mareep.region);
const ranked=rankSprites(Uint8Array.from(atob(mareep.pixels),c=>c.charCodeAt(0)),refs.entries);
assert.equal(confidentSpriteMatch(ranked),null,'Keep original visual margin strict');
const eggs=[{slot:1,ingredient:'Egg',amount:null},{slot:2,ingredient:'Egg',amount:null}];
assert.equal(contextualSpriteMatch(ranked,mareep.lines,eggs,catalog),'MAREEP');
assert.equal(parseOCR([mareep],catalog).fields.level,undefined,'Never substitute digits for unreadable Lv.Tl');
assert.equal(contextualSpriteMatch(ranked,mareep.lines,eggs.slice(0,1),catalog),null);
assert.equal(contextualSpriteMatch(ranked,mareep.lines,eggs.map(e=>({...e,amount:99})),catalog),null);
assert.equal(contextualSpriteMatch(ranked,mareep.lines.map(l=>l.text==='9'?{...l,text:'20'}:l),eggs,catalog),null,'Ambiguous evolution stays unknown');
assert.equal(contextualSpriteMatch([{species:'FLAAFFY',score:.001},...ranked],mareep.lines,eggs,catalog),null,'Never promote another portrait candidate');
assert.equal(contextualSpriteMatch([{species:'MAREEP',score:.03}],mareep.lines,eggs,catalog),null);
console.log('Passed: complete-field autosave, uncertain/missing/conflicting evidence rejection, and contextual Mareep recognition without guessing its level.');
