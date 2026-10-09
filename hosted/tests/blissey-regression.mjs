import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseOCR,subskillGrid,subskillRetryGrid} from '../dist/ocr-parser.js';
import {portraitRegion,rankSprites,confidentSpriteMatch,confidentMatch} from '../dist/sprite-matcher.js';
import {ingredientRegions,resolveIngredients} from '../dist/ingredient-matcher.js';
import {assessImport,confidentHeaderLevels} from '../dist/import-review.js';

const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const catalog=read('../dist/catalog.json');
const fixture=read('blissey-regression.json');
const original=JSON.stringify(fixture);
const decode=pixels=>Uint8Array.from(Buffer.from(pixels,'base64'));
const spriteRefs=read('../dist/sprite-features.json');
const ingredientRefs=read('../dist/ingredient-features.json');
const {lines,passes,expected,targetedRecovery}=fixture;
const image=lines=>({lines,passes});

// These are sanitized OCR/word boxes and descriptors from the reported small
// screenshot. Recompute against current references instead of trusting stored
// candidates: this also catches future portrait or ingredient data regressions.
assert.deepEqual(portraitRegion(lines,fixture.width,fixture.height),fixture.portrait.region);
const portraitCandidates=rankSprites(decode(fixture.portrait.pixels),spriteRefs.entries);
const pictureSpecies=confidentSpriteMatch(portraitCandidates);
assert.equal(pictureSpecies,fixture.expectedSpecies,'The nicknamed portrait must confidently identify Blissey');
const species=catalog.species.find(p=>p.name===pictureSpecies);
const regions=ingredientRegions(lines,fixture.width,fixture.height);
assert.deepEqual(regions,fixture.ingredients.map(({slot,amount,x,y,width,height})=>({slot,amount,x,y,width,height})));
const ingredientMatches=fixture.ingredients.map(icon=>{
  const candidates=rankSprites(decode(icon.pixels),ingredientRefs.entries);
  const ingredient=confidentMatch(candidates);
  assert.equal(ingredient,'Egg',`The slot ${icon.slot+1} icon must confidently match Egg`);
  return {...icon,candidates,ingredient};
});
const resolved=resolveIngredients(ingredientMatches,species);
assert.deepEqual(resolved.ingredients,['','Egg','Egg']);
assert.equal(species.ingredient0.length,1,'Only an unambiguous first ingredient can be filled without an icon');
const ingredients=[species.ingredient0[0].ingredient.name,...resolved.ingredients.slice(1)];
assert.deepEqual(ingredients,expected.ingredients);
assert.deepEqual([species.ingredient0,species.ingredient30,species.ingredient60].map((options,i)=>options.find(o=>o.ingredient.name===ingredients[i]).amount),[2,5,7]);

const parse=lines=>parseOCR([{lines}],catalog);
const importResult=lines=>{
  const result=parse(lines);
  result.fields.species=pictureSpecies;
  result.fields.ingredients=[...ingredients];
  return result;
};
const review=lines=>assessImport(importResult(lines),[image(lines)],catalog,{pictureSpecies});
assert.equal(subskillGrid({lines},catalog),null,'Three lower-row hits cannot establish the ordinary five-slot grid');
assert.deepEqual(new Set(parse(lines).detectedSubskills),new Set(expected.subskills.slice(2)));
assert.deepEqual(parse(lines).fields.subskills,['','','','',''],'Detected names must not be assigned to guessed slots');
assert.equal(review(lines).ready,false,'Recognizing species and ingredients cannot auto-save missing subskills');

const retry=subskillRetryGrid({lines},catalog);
assert.ok(retry,'The observed lower rows and surrounding panels should permit a bounded crop retry');
assert.deepEqual(retry.filter(cell=>!cell.hit).map(cell=>cell.level),[10,25]);
assert.deepEqual(retry.map(cell=>cell.hit?.name||''),['','',...expected.subskills.slice(2)]);
for(const [i,cell] of retry.entries()){
  const expectedCell=targetedRecovery.cells[i];
  assert.deepEqual({...cell,hit:undefined,y:expectedCell.y},{...expectedCell,hit:undefined});
  assert.ok(Math.abs(cell.y-expectedCell.y)<1e-12,'Retry crops must cover the actual missing first row');
}
assert.deepEqual(parse(lines).fields.subskills,['','','','',''],'Planning a retry must not fill absent text');

// The fixture includes actual PSM 7 crop OCR, not fabricated skill names. Once
// added, the original strict grid must assign every recovered and observed card.
const recovered=[...lines,...targetedRecovery.lines];
const recoveredGrid=subskillGrid({lines:recovered},catalog);
assert.ok(recoveredGrid);
assert.deepEqual(subskillRetryGrid({lines:recovered},catalog),recoveredGrid,'Complete grids retain the normal retry path');
const result=importResult(recovered);
for(const [key,value] of Object.entries(expected))assert.deepEqual(result.fields[key],value,`Recovered ${key}`);
assert.deepEqual(confidentHeaderLevels([image(lines)]),[61],'The clear Lv.61 word survives the low-confidence nickname line');
assert.ok(lines.find(l=>l.text==='Lv.61').confidence<.75,'Fixture must retain the actual uncertain whole-header score');
const assessment=review(recovered);
assert.equal(assessment.ready,true,assessment.reasons.join('\n'));
assert.deepEqual(assessment.reasons,[]);
assert.deepEqual(assessment.levelVerification,{method:'helping-frequency',level:61,seconds:2728},'The recorded frequency independently corroborates the recognized level');

for(const [kept,missing] of [[0,1],[1,0]]){
  const partial=[...lines,targetedRecovery.lines[kept]];
  const expectedPartial=[...expected.subskills];expectedPartial[missing]='';
  assert.deepEqual(parse(partial).fields.subskills,expectedPartial,'Partial recovery must preserve the missing cell without shifting later cards');
  const assessed=review(partial);
  assert.equal(assessed.ready,false,'A single recovered first-row card must never auto-save');
  assert.ok(assessed.reasons.includes(`Confirm the Lv. ${[10,25][missing]} subskill.`));
  assert.equal(assessed.levelVerification,undefined,'Frequency corroboration requires all five trusted subskills');
}
const weakRecovered=[...lines,...targetedRecovery.lines.map(l=>({...l,confidence:.74}))];
assert.deepEqual(parse(weakRecovered).fields.subskills,expected.subskills);
assert.equal(review(weakRecovered).ready,false,'Readable but uncertain recovery text still requires review');

const move=(line,dx=0,dy=0)=>({...line,x:line.x+dx,y:line.y+dy,words:line.words?.map(w=>({...w,x:w.x+dx,y:w.y+dy}))});
const change=(name,fn)=>lines.map(l=>l.text===name?fn(l):l);
const reject=(candidate,message)=>{
  assert.equal(subskillGrid({lines:candidate},catalog),null,`${message}: ordinary grid`);
  assert.equal(subskillRetryGrid({lines:candidate},catalog),null,message);
};
reject(lines.filter(l=>!/Main Skill & Sub Skills/.test(l.text)),'Missing upper section anchor must block inference');
reject(lines.filter(l=>l.text!=='Energy for Everyone S'),'Missing main-skill label must block inference');
reject(lines.filter(l=>l.text!=='Bashful'),'A cropped-away nature panel must block inference');
reject(change('Bashful',l=>({...l,confidence:.74})),'An uncertain nature anchor must not permit inference');
reject(change('Energy for Everyone S',l=>move(l,0,-.11)),'Main skill outside the section must not anchor a retry');
reject(change('Bashful',l=>move(l,0,-.10)),'A nature label too close to the cards indicates an unsupported layout');
reject(lines.filter(l=>l.text!=='Ingredient Finder M'),'Only two visible cards cannot establish a missing row');
reject(change('Ingredient Finder M',l=>({...l,confidence:.74})),'An uncertain observed card cannot establish the inferred row');
reject(change('Helping Speed S',l=>move(l,-.45)),'Two middle cards in one column must be rejected');
reject(change('Helping Speed M',l=>move(l,.45)),'The final card must occupy the left column');
reject(change('Helping Speed S',l=>move(l,0,.025)),'Misaligned middle cards must not be treated as one row');
reject(change('Helping Speed M',l=>move(l,0,.05)),'Excessive row spacing must block extrapolation');
const conflicting={...lines.find(l=>l.text==='Ingredient Finder M'),text:'Berry Finding S'};
delete conflicting.words;
reject([...lines,conflicting],'Conflicting names in an observed cell must not be ignored');

assert.equal(JSON.stringify(fixture),original,'Recognition and retry planning must not mutate the evidence fixture');
console.log('Passed: Blissey portrait and Egg icons, actual first-row OCR recovery, level 61 corroboration, partial/uncertain recovery safety, and invalid layout/anchor rejection.');
