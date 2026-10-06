import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Engine,skillExpectation} from '../dist/engine.js';
const c=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const engine=new Engine(c),cases=JSON.parse(fs.readFileSync(new URL('python-golden.json',import.meta.url)));
function compare(actual,expected,path='root'){
  if(typeof expected==='number'){assert.ok(Math.abs(actual-expected)<1e-6,`${path}: ${actual} != ${expected}`);return}
  if(expected&&typeof expected==='object'){for(const k of Object.keys(expected)){if(k==='modelVersion')continue;compare(actual[k],expected[k],`${path}.${k}`)}return}
  assert.equal(actual,expected,path);
}
for(const row of cases){compare(engine.calculate(engine.validate(row.build)),row.current,row.build.species);if(row.analysis)compare(engine.analyze(row.build),row.analysis,row.build.species)}
assert.equal(skillExpectation(3,1,2),2);
assert.throws(()=>engine.validate({...cases[0].build,level:NaN}));
assert.throws(()=>engine.validate({...cases[0].build,subskills:Array(5).fill('Berry Finding S')}));
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(const [,path] of html.matchAll(/(?:src|href)="(\/[^"?]+)"/g))assert.ok(fs.existsSync(new URL('../dist'+path,import.meta.url)),`Missing ${path}`);
console.log(`Passed: ${cases.length} Python parity cases, 7 complete analyses, validation and local assets.`);
