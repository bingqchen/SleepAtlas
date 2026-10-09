import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseOCR} from '../dist/ocr-parser.js';
import {assessImport,confidentHeaderLevels} from '../dist/import-review.js';
import {calculatedStats} from '../dist/pokemon-stats.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const subskills=['Inventory Up L','Skill Trigger M','Ingredient Finder M','Helping Speed S','Helping Speed M'];
const line=(text,x,y,confidence=.96)=>({text,x,y,w:.25,h:.014,confidence});
function photo({species='BLISSEY',level=61,nature='Bashful',skills=subskills,seconds}={}){
  const p=catalog.species.find(p=>p.name===species),build={species,level,nature,subskills:skills};
  const frequency=seconds??calculatedStats(catalog,build).frequencySeconds;
  const lines=[line(`Lv.${level} nickname`,.216,.11,.35),line(`Every ${Math.floor(frequency/60)} mins ${frequency%60} secs`,.435,.21),line('Carry Limit 55',.1,.27),line('Main Skill & Sub Skills',.1,.34),line(`${p.skillLabel} Lv.1`,.25,.41),...skills.map((s,i)=>line(s,i%2?.60:.12,.54+Math.floor(i/2)*.075)),line('Additional Stats',.1,.80),line(nature,.2,.85)];
  return {species,lines};
}
function assess(image,change=()=>{},pictureSpecies=image.species){
  const result=parseOCR([image],catalog),p=catalog.species.find(p=>p.name===image.species);
  result.fields.species=image.species;result.fields.ingredients=[0,30,60].map(l=>p[`ingredient${l}`][0].ingredient.name);change(result.fields);
  return {result,review:assessImport(result,[image],catalog,{pictureSpecies})};
}
const good=photo(),verified=assess(good);
assert.equal(verified.result.fields.displayedFrequencySeconds,2728);
assert.equal(verified.review.ready,true);
assert.deepEqual(verified.review.levelVerification,{method:'helping-frequency',level:61,seconds:2728});
assert.equal(assess(good,fields=>fields.settings={helpingFrequencyFactor:.5,teamHelpingBonus:4}).review.ready,true,'Collection assumptions cannot change the displayed-stat check');
for(const level of [25,30,49,50,60,69,70,79,80,100])assert.equal(assess(photo({level})).review.levelVerification?.level,level,`Apply speed subskill unlocks at level ${level}`);
function rejectsLevel(image,change,picture){const {review}=assess(image,change,picture);assert.equal(review.ready,false);assert.equal(review.levelVerification,undefined);assert.ok(review.reasons.some(r=>/level/.test(r)));}
rejectsLevel({...good,lines:good.lines.map((l,i)=>i===0?{...l,text:'Lv.Tl nickname'}:l)});
rejectsLevel(good,fields=>delete fields.level);
rejectsLevel(photo({seconds:2734})); // Blissey Lv.60 frequency cannot confirm Lv.61.
rejectsLevel(good,undefined,null);
rejectsLevel({...good,lines:[...good.lines,line('Lv.62',.22,.11)]});
rejectsLevel({...good,lines:[...good.lines,line('Lv.62',.22,.11,.4)]});
rejectsLevel({...good,passes:[good.lines,[...good.lines,line('Lv.62',.22,.11)]]});
rejectsLevel({...good,lines:[...good.lines,line('Every 46 mins 0 secs',.435,.21)]});
for(const marker of ['Every','Bashful','Inventory Up L'])rejectsLevel({...good,lines:good.lines.map(l=>l.text.startsWith(marker)?{...l,confidence:.4}:l)});
rejectsLevel({...good,lines:[...good.lines,line('Helping Speed S',.12,.54)]});
rejectsLevel({...good,lines:[...good.lines,line('Good-Night Ribbon',.15,.92)]});
rejectsLevel(good,fields=>fields.frequencySource='calculated');
const minted=photo({nature:'Brave'});rejectsLevel({...minted,lines:[...minted.lines,line('This Nature has no effect',.55,.86)]});
// A neutralized Brave Lv.60 shares 2734 seconds with unmodified Brave Lv.11.
// The nature name may sit between the two effect lines in either OCR pass.
const aliasedMint=photo({level:11,nature:'Brave',seconds:2734});
assert.equal(assess(aliasedMint).review.levelVerification?.level,11);
for(const ordered of [
  [line('This Nature has',.52,.835),line('Brave',.22,.846),line('no effect',.52,.855)],
  [line('no effect',.52,.855),line('Brave',.22,.846),line('This Nature has',.52,.835)]
])rejectsLevel({...aliasedMint,lines:[...aliasedMint.lines.filter(l=>l.text!=='Brave'),...ordered]});
rejectsLevel(photo({species:'RAIKOU',nature:'Brave',skills:['Helping Speed S','Helping Speed M','Ingredient Finder M','Skill Trigger S','Skill Trigger M'],seconds:1312}));
// A confident level word survives a line made uncertain by a custom nickname.
const words=[{...line('Lv.61',.216,.11),w:.075}];
const wordPhoto={...good,lines:good.lines.map((l,i)=>i===0?{...l,words}:l)};
assert.deepEqual(confidentHeaderLevels([wordPhoto]),[61]);
const weakFrequency={...wordPhoto,lines:wordPhoto.lines.map(l=>l.text.startsWith('Every')?{...l,confidence:.4}:l)};
const wordReview=assess(weakFrequency).review;
assert.equal(wordReview.levelVerification,undefined);assert.ok(!wordReview.reasons.some(r=>/Pokémon level/.test(r)));assert.ok(wordReview.reasons.some(r=>/helping frequency/.test(r)));
assert.deepEqual(confidentHeaderLevels([{lines:[{words:[{...words[0],text:'Lv.',w:.03},{...words[0],text:'61',x:.25,w:.04}]}]}]),[61]);
for(const mutation of [{x:.8},{y:.7},{confidence:.4},{x:undefined},{text:'Lv.Tl'}])assert.deepEqual(confidentHeaderLevels([{lines:[{words:[{...words[0],...mutation}]}]}]),[]);
assert.deepEqual(confidentHeaderLevels([{lines:[{words:[{...words[0],text:'Lv.',w:.03},{...words[0],text:'61',x:.4,w:.04}]}]}]),[],'Unrelated numbers do not join a level token');
const conflictingWord={...good,lines:good.lines.map((l,i)=>i===0?{...l,confidence:.95,words:[{...words[0],text:'Lv.62'}]}:l)};
assert.equal(assess(conflictingWord).review.ready,false);
console.log('Passed: header-word confidence and unique helping-frequency level corroboration; missing/conflicting readings, unknown effects, wrong stats, unlocks, and tolerance ambiguity stay reviewable.');
