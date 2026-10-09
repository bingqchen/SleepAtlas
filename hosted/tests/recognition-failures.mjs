import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parseOCR} from '../dist/ocr-parser.js';
import {assessImport} from '../dist/import-review.js';
import {resolveIngredients} from '../dist/ingredient-matcher.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const catalog=read('../dist/catalog.json'),fixture=read('blissey-regression.json'),lines=[...fixture.lines,...fixture.targetedRecovery.lines];
const source=fs.readFileSync(new URL('../dist/ocr.js',import.meta.url),'utf8');
const readerSource=source.slice(source.indexOf('export async function readScreenshots'),source.indexOf('// Reuse one OCR worker')).replace('export async','async');
async function run({pictureError=false,ingredientError=false}={}){
  const worker={setParameters:async()=>{},terminate:async()=>{}},canvas={width:589,height:1280};
  const ctx=vm.createContext({crypto,initialize:async()=>({catalog}),savePictures:async pictures=>pictures.map(p=>p.id),
    Tesseract:{createWorker:async()=>worker},canvasFor:async()=>canvas,recognize:async()=>structuredClone(lines),contrastCanvas:()=>({...canvas}),readMissingCells:async()=>{},
    identifySprite:async()=>{if(pictureError)throw Error('Reference fetch failed');return {species:'BLISSEY'}},
    identifyIngredients:async()=>{if(ingredientError)throw Error('Reference fetch failed');return fixture.ingredients},contextualSpriteMatch:()=>null,
    resolveIngredients,parseOCR,assessImport});
  vm.runInContext(readerSource,ctx);
  return vm.runInContext("readScreenshots([{name:'test.jpg',type:'image/jpeg'}],()=>{})",ctx);
}
const success=await run();assert.equal(success.review.ready,true);
const noPortrait=await run({pictureError:true});
assert.equal(noPortrait.review.ready,false);assert.equal(noPortrait.fields.species,undefined);
assert.equal(noPortrait.ingredientMatches.length,2,'Ingredient evidence survives a portrait-reference failure');
assert.ok(noPortrait.review.reasons.some(r=>/Pokémon picture matching could not load/.test(r)),'Batch review must show the loading failure, not hide it in general warnings');
assert.ok(noPortrait.review.reasons.some(r=>/Download for offline use/.test(r)));
const noIngredients=await run({ingredientError:true});
assert.equal(noIngredients.fields.species,'BLISSEY');assert.equal(noIngredients.review.ready,false);
assert.ok(noIngredients.review.reasons.some(r=>/Ingredient picture matching could not load/.test(r)));
console.log('Passed: reference-loading failures preserve other readings, block auto-save and appear as actionable batch-review reasons.');
