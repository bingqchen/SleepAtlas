import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseOCR,subskillGrid} from '../dist/ocr-parser.js';
import {rankSprites,confidentMatch,confidentSpriteMatch,spriteDescriptor} from '../dist/sprite-matcher.js';
const c=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),image=JSON.parse(fs.readFileSync(new URL('sceptile-ocr-lines.json',import.meta.url)));
image.lines.unshift({text:'Lv. 67 custom nickname',x:.216,y:.107,w:.22,h:.011,confidence:.94});
const result=parseOCR([image],c);
assert.equal(result.fields.species,undefined);
assert.equal(result.fields.level,67);assert.equal(result.fields.skillLevel,6);assert.equal(result.fields.nature,'Hasty');assert.equal(result.fields.carrySize,39);
assert.deepEqual(result.fields.subskills,['Berry Finding S','Inventory Up S','Helping Speed M','Inventory Up L','Skill Trigger S']);
const missed={lines:image.lines.filter(l=>!l.text.includes('Helping Speed M'))};
assert.deepEqual(parseOCR([missed],c).fields.subskills,['Berry Finding S','Inventory Up S','','Inventory Up L','Skill Trigger S']);
assert.equal(subskillGrid(missed,c).find(c=>!c.hit).level,50);
const cropped={lines:missed.lines.filter(l=>l.y>.6)};assert.equal(subskillGrid(cropped,c),null);
const refs=JSON.parse(fs.readFileSync(new URL('../dist/sprite-features.json',import.meta.url)));
assert.equal(new Set(refs.entries.map(e=>e.species)).size,c.species.length);
for(const species of ['SCEPTILE','MEWTWO']){const entry=refs.entries.find(e=>e.species===species&&!e.shiny),pixels=Uint8Array.from(atob(entry.pixels),x=>x.charCodeAt(0));assert.equal(confidentMatch(rankSprites(pixels,refs.entries)),species)}
assert.equal(confidentMatch([{species:'ONE',score:.01},{species:'TWO',score:.011}]),null);
assert.equal(confidentMatch([{species:'ONE',score:.1},{species:'TWO',score:.2}]),null);
assert.equal(spriteDescriptor({data:new Uint8Array(32*32*4).fill(255),width:32,height:32}),null);
// Numeric descriptors derived from the three reported screenshots; no complete
// screenshot, nickname, or other user UI content is included in the fixture.
for(const fixture of JSON.parse(fs.readFileSync(new URL('portrait-regressions.json',import.meta.url)))){
  const pixels=Uint8Array.from(atob(fixture.pixels),c=>c.charCodeAt(0));
  assert.equal(confidentSpriteMatch(rankSprites(pixels,refs.entries)),fixture.species);
}
assert.equal(confidentSpriteMatch([{species:'ONE',score:.002},{species:'TWO',score:.0025}]),null);
assert.equal(confidentSpriteMatch([{species:'ONE',score:.018},{species:'TWO',score:.02}]),null);
assert.equal(confidentSpriteMatch([{species:'ONE',score:.04},{species:'TWO',score:.1}]),null);
const pale=new Uint8Array(64*64*4).fill(255);
for(let y=8;y<18;y++)for(let x=25;x<39;x++)pale.set([90,175,110,255],(y*64+x)*4);
for(let y=48;y<54;y++)for(let x=15;x<49;x++)pale.set([180,180,180,255],(y*64+x)*4);
const outline=spriteDescriptor({width:64,height:64,data:pale});
assert.ok([...outline.slice(18*24*3)].some((v,i,a)=>i%3===0&&v<210&&v===a[i+1]&&v===a[i+2]),'Gray shadow at the bottom must remain part of a pale sprite');
console.log('Passed: nicknames do not block main skill reading; partial grid retains four known skills and locates the missing cell; all 247 species have sprite references; ambiguous and empty images are rejected.');
