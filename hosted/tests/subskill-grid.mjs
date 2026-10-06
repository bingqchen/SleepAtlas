import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseOCR,subskillGrid} from '../dist/ocr-parser.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
// Only the subskill area of the reported 589 × 1280 screenshot is retained:
// recognized text and normalized geometry from the original/contrast passes.
const fixture=JSON.parse(fs.readFileSync(new URL('gardevoir-small-ocr-lines.json',import.meta.url)));
const expected=['Ingredient Finder M','Helping Speed M','Skill Trigger M','Inventory Up S','Skill Trigger S'];
const parsed=lines=>parseOCR([{lines}],catalog);
const skills=lines=>parsed(lines).fields.subskills;
assert.deepEqual(skills(fixture.lines),expected,'Actual small Gardevoir screenshot must fill all five slots');

const line=(text,x,y)=>({text,x,y,w:.30,h:.013,confidence:.94});
const separate=expected.map((name,i)=>line(name,i%2?.612:.137,.532+.072*Math.floor(i/2)));
const withWords=l=>{
  let x=l.x;
  const words=l.text.split(' ').map(text=>{
    const word={...l,text,x,w:text.length*.013};
    x+=word.w+.01;
    return word;
  });
  return {...l,words};
};
const merge=(left,right)=>({
  text:`${left.text} | ${right.text} |`,x:left.x,y:left.y-.016,w:.79,h:.044,confidence:.89,
  words:[...withWords(left).words,{text:'|',x:.47,y:left.y-.016,w:.007,h:.044,confidence:.74},...withWords(right).words]
});
const merged=[merge(separate[0],separate[1]),merge(separate[2],separate[3]),withWords(separate[4])];
assert.deepEqual(skills(merged),expected,'Word boxes must separate card names even if OCR combines the entire row');
assert.deepEqual(skills([...merged,...separate.map(withWords)]),expected,'Original and contrast passes must not create extra slots');
assert.deepEqual(skills([...separate.map(withWords),...merged]),expected,'Pass order must not change the assigned slots');
assert.deepEqual(skills(separate),expected,'Legacy single-name OCR lines without words must still work');

const ambiguous=merged.map(({words,...l})=>l);
assert.deepEqual(skills([...ambiguous,...separate]),expected,'Ambiguous merged lines must not invalidate reliable separate-card evidence');
assert.deepEqual(skills([...separate,...ambiguous]),expected,'Reliable evidence must also win in the opposite pass order');
assert.equal(subskillGrid({lines:ambiguous},catalog),null,'Multi-name lines without word geometry cannot establish left/right slots');
assert.deepEqual(skills(ambiguous),['','','','',''],'Do not guess positions from text order alone');
assert.deepEqual(new Set(parsed(ambiguous).detectedSubskills),new Set(expected),'Detected names remain visible even when their slot is uncertain');

const missing=separate.filter((_,i)=>i!==1);
assert.deepEqual(skills(missing),[expected[0],'',...expected.slice(2)],'A missing card must stay blank without shifting later skills');
assert.equal(subskillGrid({lines:missing},catalog).find(cell=>!cell.hit).level,25);
const partial=separate.slice(0,4);
assert.equal(subskillGrid({lines:partial},catalog),null,'A cropped two-row grid cannot establish all unlock positions');
assert.deepEqual(skills(partial),['','','','','']);
const conflicting=[...separate,line('Berry Finding S',separate[0].x,separate[0].y)];
assert.equal(subskillGrid({lines:conflicting},catalog),null,'Conflicting skill names in the same card must not be silently chosen');
assert.deepEqual(skills(conflicting),['','','','','']);
const sameColumn=separate.map((l,i)=>i===1?{...l,x:.35}:l);
assert.equal(subskillGrid({lines:sameColumn},catalog),null,'Two separate hits in one column cannot establish a two-column grid');
assert.deepEqual(skills(sameColumn),['','','','','']);

console.log('Passed: small Gardevoir OCR, merged rows, duplicate passes, legacy geometry, ambiguous rows, missing cells, and partial/conflicting layout safety.');
