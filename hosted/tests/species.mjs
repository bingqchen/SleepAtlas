import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseOCR,subskillGrid} from '../dist/ocr-parser.js';
import {rankSprites,confidentMatch,confidentSpriteMatch,spriteDescriptor,portraitRegion} from '../dist/sprite-matcher.js';
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
assert.equal(refs.entries.filter(e=>!e.renderSize).length,495);
assert.equal(refs.entries.length,1485);
for(const size of [48,80])assert.equal(new Set(refs.entries.filter(e=>e.renderSize===size&&e.renderOpacity===.65).map(e=>e.species)).size,c.species.length);
for(const species of ['SCEPTILE','MEWTWO']){const entry=refs.entries.find(e=>e.species===species&&!e.shiny),pixels=Uint8Array.from(atob(entry.pixels),x=>x.charCodeAt(0));assert.equal(confidentMatch(rankSprites(pixels,refs.entries)),species)}
assert.equal(confidentMatch([{species:'ONE',score:.01},{species:'TWO',score:.011}]),null);
assert.equal(confidentMatch([{species:'ONE',score:.1},{species:'TWO',score:.2}]),null);
assert.equal(spriteDescriptor({data:new Uint8Array(32*32*4).fill(255),width:32,height:32}),null);
// The reported small Blissey screenshot merges part of its portrait into the
// header line. Use the level word, not the line's left edge, as the crop anchor.
const header={text:'ax Lv.61 nickname',x:54/589,y:135/1280,w:160/589,h:19/1280,words:[{text:'ax',x:54/589,y:141/1280,w:50/589,h:13/1280},{text:'Lv.61',x:128/589,y:138/1280,w:39/589,h:12/1280}]};
assert.deepEqual(portraitRegion([header],589,1280),{x:37,y:85,width:81,height:80});
assert.deepEqual(portraitRegion([{...header,text:'Lv.61 nickname',x:128/589,words:[]}],589,1280),{x:37,y:82,width:81,height:80});
assert.equal(portraitRegion([{...header,words:[]}],589,1280),null);
assert.equal(portraitRegion([{text:'Lv.60',x:.77,y:.1,words:[{text:'Lv.60',x:.77,y:.1}]}],589,1280),null,'Ingredient unlocks cannot anchor a portrait');
assert.equal(portraitRegion([{...header,y:.7,words:header.words.map(w=>({...w,y:.7}))}],589,1280),null,'Subskill unlocks cannot anchor a portrait');
const faintHeader={text:'v.52 nickname',x:128/589,y:138/1280,w:.2,h:.012};
assert.deepEqual(portraitRegion([faintHeader],589,1280),{x:37,y:85,width:81,height:80});
assert.equal(parseOCR([{lines:[faintHeader]}],c).fields.level,52);
assert.equal(parseOCR([{lines:[{...faintHeader,x:.8}]}],c).fields.level,undefined);
assert.equal(parseOCR([{lines:[{...faintHeader,y:.7}]}],c).fields.level,undefined);
// Numeric descriptors derived from reported screenshots; no complete
// screenshot, nickname, or other user UI content is included in the fixture.
for(const fixture of JSON.parse(fs.readFileSync(new URL('portrait-regressions.json',import.meta.url)))){
  const pixels=Uint8Array.from(atob(fixture.pixels),c=>c.charCodeAt(0));
  assert.equal(confidentSpriteMatch(rankSprites(pixels,refs.entries)),fixture.species);
}
assert.equal(confidentSpriteMatch([{species:'ONE',score:.002},{species:'TWO',score:.0025}]),null);
assert.equal(confidentSpriteMatch([{species:'ONE',score:.018},{species:'TWO',score:.02}]),null);
assert.equal(confidentSpriteMatch([{species:'ONE',score:.04},{species:'TWO',score:.1}]),null);
for(const rgb of [[255,255,255],[255,255,233],[255,255,224],[255,225,225],[190,190,190]]){
  const data=new Uint8Array(81*80*4);for(let i=0;i<81*80;i++)data.set([...rgb,255],i*4);
  assert.equal(confidentSpriteMatch(rankSprites(spriteDescriptor({data,width:81,height:80}),refs.entries)),null,'Blank/solid portrait regions must not match a pale reference');
}
const pale=new Uint8Array(64*64*4).fill(255);
for(let y=8;y<18;y++)for(let x=25;x<39;x++)pale.set([90,175,110,255],(y*64+x)*4);
for(let y=48;y<54;y++)for(let x=15;x<49;x++)pale.set([180,180,180,255],(y*64+x)*4);
const outline=spriteDescriptor({width:64,height:64,data:pale});
assert.ok([...outline.slice(18*24*3)].some((v,i,a)=>i%3===0&&v<210&&v===a[i+1]&&v===a[i+2]),'Gray shadow at the bottom must remain part of a pale sprite');
console.log('Passed: nicknames do not block main skill reading; partial grid retains four known skills and locates the missing cell; all 249 species have sprite references; ambiguous and empty images are rejected.');
