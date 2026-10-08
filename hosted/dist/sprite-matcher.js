import {parseOCR} from './ocr-parser.js';
// Small on-device picture descriptors. No screenshot pixels leave the device.
const SIZE=24;
export function spriteDescriptor({data,width,height}){
  const mask=new Uint8Array(width*height);let x0=width,y0=height,x1=-1,y1=-1,count=0;
  for(let i=0;i<mask.length;i++){
    const j=i*4,r=data[j],g=data[j+1],b=data[j+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);
    // Pale bodies still have gray outlines/shadows. Keeping these prevents the
    // bounding box from shrinking to just a head or another colored patch.
    if(data[j+3]>180&&((hi-lo>25&&lo<230)||hi<200)){mask[i]=1;count++;const x=i%width,y=Math.floor(i/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
  }
  if(count<30||x1-x0<8||y1-y0<8)return null;
  const scale=Math.max(x1-x0+1,y1-y0+1)/(SIZE-2),cx=(x0+x1)/2,cy=(y0+y1)/2,out=new Uint8Array(SIZE*SIZE*3);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const values=[0,0,0];for(const sy of [.25,.75])for(const sx of [.25,.75]){const ix=Math.round(cx+(x+sx-SIZE/2)*scale),iy=Math.round(cy+(y+sy-SIZE/2)*scale),inside=ix>=0&&ix<width&&iy>=0&&iy<height&&mask[iy*width+ix];for(let k=0;k<3;k++)values[k]+=(inside?data[(iy*width+ix)*4+k]:255)/4}
    for(let k=0;k<3;k++)out[(y*SIZE+x)*3+k]=Math.round(values[k]);
  }
  return out;
}
export function rankSprites(descriptor,entries){
  if(!descriptor)return [];
  const scores=new Map();
  for(const entry of entries){
    const pixels=entry.decoded||(entry.decoded=Uint8Array.from(atob(entry.pixels),c=>c.charCodeAt(0)));
    let error=0;for(let i=0;i<descriptor.length;i++)error+=(descriptor[i]-pixels[i])**2;
    const score=error/descriptor.length/255**2;
    if(!scores.has(entry.species)||score<scores.get(entry.species))scores.set(entry.species,score);
  }
  return [...scores].map(([species,score])=>({species,score})).sort((a,b)=>a.score-b.score);
}
export function confidentMatch(ranked){
  const [best,next]=ranked;
  return best&&next&&best.score<.020&&next.score-best.score>.005&&next.score>best.score*1.35?best.species:null;
}
export function confidentSpriteMatch(ranked){
  const [best,next]=ranked;
  // Pale sprites have fewer colored pixels and smaller absolute errors. Require
  // a strong relative margin plus a minimum separation, without penalizing them
  // solely for containing large white areas. Ingredient matching stays separate.
  return best&&next&&best.score<.020&&next.score-best.score>Math.max(.0015,best.score*.60)?best.species:null;
}
let references;
export function portraitRegion(lines,w,h){
  // Anchor the small portrait beside the Pokémon level. A right-side ingredient
  // unlock marker cannot anchor this crop; keep an uncertain picture unselected.
  const headers=lines.filter(l=>l.y<.32&&/\b(?:Lv\.?|Level|v\.)\s*[a-z0-9]{1,3}\b/i.test(l.text));
  // Segmentation can merge the portrait with its level/nickname. The level's
  // word box stays accurate even when the complete line starts in the picture.
  // The Lv prefix can still locate the portrait when OCR cannot read the
  // number (for example, “Lv.Tl”). This does not guess the Pokémon's level.
  const words=headers.flatMap(l=>(l.words||[]).filter(w=>/^(?:Lv\.?|Level|v\.)(?:\s*[a-z0-9]{1,3})?$/i.test(w.text.trim())));
  const level=[...words,...headers].find(l=>l.x>.15&&l.x<.40&&l.y<.32);
  if(!level)return null;
  const x=Math.max(0,Math.round((level.x-.155)*w)),y=Math.max(0,Math.round(level.y*h-.09*w));
  const width=Math.min(Math.round(.137*w),w-x),height=Math.min(Math.round(.135*w),h-y);
  if(width<=0||height<=0)return null;
  return {x,y,width,height};
}
export async function identifySprite(canvas,lines){
  const region=portraitRegion(lines,canvas.width,canvas.height);if(!region)return null;
  const descriptor=spriteDescriptor(canvas.getContext('2d').getImageData(region.x,region.y,region.width,region.height));if(!descriptor)return null;
  if(!references)references=fetch('/sprite-features.json').then(r=>{if(!r.ok)throw Error('Picture references unavailable');return r.json()}).catch(e=>{references=null;throw e});
  const ranked=rankSprites(descriptor,(await references).entries);
  return {species:confidentSpriteMatch(ranked),candidates:ranked};
}
export function contextualSpriteMatch(ranked,lines,ingredients,catalog){
  const best=ranked?.[0];if(!best||best.score>=.020)return null;
  const clean=text=>String(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const trusted=lines.filter(l=>l.confidence>=.8),skills=new Set(catalog.species.filter(p=>trusted.some(l=>l.y>.3&&l.y<.65&&clean(l.text).includes(clean(p.skillLabel)))).map(p=>p.skillLabel));
  // Use a confidently read main skill, two ingredient icons,
  // and carry capacity as independent constraints. Never promote an image
  // candidate that wasn't already the best overall portrait match.
  if(skills.size!==1)return null;
  const slots=[1,2].map(slot=>ingredients.filter(m=>m.slot===slot&&m.ingredient));
  if(slots.some(ms=>!ms.length||new Set(ms.map(m=>m.ingredient)).size!==1||new Set(ms.map(m=>m.amount).filter(Number.isInteger)).size>1))return null;
  const stats=parseOCR([{lines:trusted}],catalog),carry=stats.fields.carrySize;if(!carry||new Set(stats.evidence.carrySize).size!==1)return null;
  const eligible=catalog.species.filter(p=>skills.has(p.skillLabel)&&p.carrySize<=carry&&slots.every((ms,i)=>p[`ingredient${i===0?30:60}`].some(o=>o.ingredient.name===ms[0].ingredient&&ms.every(m=>!Number.isInteger(m.amount)||o.amount===m.amount))));
  return eligible.length===1&&eligible[0].name===best.species?best.species:null;
}
