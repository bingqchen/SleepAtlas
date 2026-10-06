// Compare ingredient pictures locally, including the faded art of locked slots.
import {rankSprites,confidentMatch} from './sprite-matcher.js';
const SIZE=24;
export function ingredientDescriptor({data,width,height}){
  const mask=new Uint8Array(width*height),seen=new Uint8Array(mask.length);let largest=[];
  for(let i=0;i<mask.length;i++){
    const j=i*4,hi=Math.max(data[j],data[j+1],data[j+2]),lo=Math.min(data[j],data[j+1],data[j+2]);
    mask[i]=data[j+3]>180&&((hi-lo>38&&lo<215)||hi<160)?1:0;
  }
  // Isolate the icon from the pale circle, quantity pill, and lock label.
  for(let i=0;i<mask.length;i++){
    if(!mask[i]||seen[i])continue;
    const part=[],stack=[i];seen[i]=1;
    while(stack.length){const j=stack.pop(),x=j%width,y=Math.floor(j/width);part.push(j);
      for(const k of [x?j-1:-1,x<width-1?j+1:-1,y?j-width:-1,y<height-1?j+width:-1])if(k>=0&&mask[k]&&!seen[k]){seen[k]=1;stack.push(k)}
    }
    if(part.length>largest.length)largest=part;
  }
  if(largest.length<30)return null;
  let x0=width,y0=height,x1=-1,y1=-1;
  for(const i of largest){const x=i%width,y=Math.floor(i/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
  if(Math.min(x1-x0,y1-y0)<8)return null;
  const scale=Math.max(x1-x0+1,y1-y0+1)/(SIZE-2),cx=(x0+x1)/2,cy=(y0+y1)/2,out=new Uint8Array(SIZE*SIZE*3);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const values=[0,0,0];for(const sy of [.25,.75])for(const sx of [.25,.75]){
      const ix=Math.round(cx+(x+sx-SIZE/2)*scale),iy=Math.round(cy+(y+sy-SIZE/2)*scale),inside=ix>=x0&&ix<=x1&&iy>=y0&&iy<=y1&&mask[iy*width+ix];
      for(let k=0;k<3;k++)values[k]+=(inside?data[(iy*width+ix)*4+k]:255)/4;
    }
    for(let k=0;k<3;k++)out[(y*SIZE+x)*3+k]=Math.round(values[k]);
  }
  return out;
}
export function ingredientRegions(lines,width,height){
  const frequency=lines.find(l=>/every\s+\d+\s*(?:mins?|hours?)/i.test(l.text));if(!frequency)return [];
  const counts=lines.flatMap(l=>{const m=l.text.trim().match(/^[([\s]*[x×*]\s*(\d{1,2})[)\]\s]*$/i),cx=l.x+l.w/2;
    return m&&cx>.46&&cx<.96&&frequency.y-l.y>.015&&frequency.y-l.y<.10?[{...l,cx,amount:Number(m[1]),slot:cx<.625?0:cx<.79?1:2}]:[];
  }).sort((a,b)=>b.confidence-a.confidence);
  const unique=counts.filter((c,i)=>!counts.slice(0,i).some(p=>p.slot===c.slot));
  // Require a row of at least two quantity markers with the expected spacing.
  const regions=unique.filter(c=>c.slot>0&&unique.some(p=>p.slot!==c.slot&&Math.abs(c.y-p.y)*height<.018*width&&Math.abs(Math.abs(c.cx-p.cx)/Math.abs(c.slot-p.slot)-.166)<.025)).map(c=>({slot:c.slot,amount:c.amount,x:Math.round((c.cx-.120)*width),y:Math.round(c.y*height-.102*width),width:Math.round(.140*width),height:Math.round(.099*width)}));
  // Tiny quantity labels can disappear in OCR. The standard stats panel gives
  // a second anchor: Frequency, then the carry value, then the skills heading.
  const carry=lines.some(l=>/^\d{1,3}$/.test(l.text.trim())&&l.x>.38&&l.x<.6&&(l.y-frequency.y)*height>.08*width&&(l.y-frequency.y)*height<.17*width);
  const skills=lines.some(l=>/main\s*skill.*sub\s*skills/i.test(l.text)&&l.y>frequency.y&&l.y-frequency.y<.22);
  if(frequency.x>.38&&frequency.x<.6&&carry&&skills)for(const slot of [1,2])if(!regions.some(r=>r.slot===slot))regions.push({slot,amount:null,x:Math.round((slot===1?.59:.755)*width),y:Math.round(frequency.y*height-.199*width),width:Math.round(.140*width),height:Math.round(.099*width)});
  return regions.filter(r=>r.x>=0&&r.y>=0&&r.x+r.width<=width&&r.y+r.height<=height);
}
let references;
export async function identifyIngredients(canvas,lines){
  const regions=ingredientRegions(lines,canvas.width,canvas.height);if(!regions.length)return [];
  if(!references)references=fetch('/ingredient-features.json').then(r=>{if(!r.ok)throw Error('Ingredient references unavailable');return r.json()}).catch(e=>{references=null;throw e});
  const refs=await references;
  return regions.map(region=>{
    const descriptor=ingredientDescriptor(canvas.getContext('2d').getImageData(region.x,region.y,region.width,region.height));
    const ranked=rankSprites(descriptor,refs.entries),ingredient=confidentMatch(ranked);
    return {...region,ingredient:ingredient==='Locked'?null:ingredient};
  });
}
export function resolveIngredients(matches,p){
  const ingredients=['','',''],warnings=[],labels=[];if(!p)return {ingredients,warnings};
  for(const slot of [1,2]){
    const hits=matches.filter(m=>m.slot===slot&&m.ingredient),names=[...new Set(hits.map(m=>m.ingredient))],level=slot===1?30:60;
    if(names.length>1){warnings.push(`The screenshots disagree on the Lv. ${level} ingredient. Confirm that slot manually.`);continue}
    if(!names.length)continue;
    const option=p[`ingredient${level}`].find(o=>o.ingredient.name===names[0]);
    if(!option||hits.some(m=>m.amount!=null&&m.amount!==option.amount)){warnings.push(`The Lv. ${level} icon or quantity does not match this species’ options. Confirm it manually.`);continue}
    ingredients[slot]=option.ingredient.name;labels.push(`Lv. ${level}: ${option.ingredient.longName} ×${option.amount}`);
  }
  if(labels.length)warnings.unshift(`Ingredient picture matches — ${labels.join('; ')}. Confirm before saving.`);
  return {ingredients,warnings};
}
