import {parseOCR} from './ocr-parser.js';
import {Engine} from './engine.js';

// Require field-level evidence. An average OCR score can hide a missing or
// misread stat, so only matching readings from confident lines qualify.
export function assessImport(result,images,catalog,{pictureSpecies=null,issues=[]}={}){
  const fields=result.fields,reasons=[...issues],trusted=parseOCR(images.map(image=>({lines:image.lines.filter(l=>l.confidence>=.75)})),catalog).fields;
  const readings=images.flatMap(image=>(image.passes||[image.lines]).map(lines=>parseOCR([{lines}],catalog))),passes=readings.map(r=>r.fields);
  const combined=parseOCR(images,catalog);
  // A species-looking header can itself be a nickname. Never auto-save a
  // text-only species guess when the portrait was ambiguous or unavailable.
  if(!pictureSpecies||pictureSpecies!==fields.species)reasons.push('Confirm the species; the portrait could not be verified.');
  const p=catalog.species.find(p=>p.name===fields.species),normalize=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(p&&!images.some(image=>image.lines.some(l=>l.confidence>=.75&&l.y>.3&&l.y<.7&&` ${normalize(l.text)} `.includes(` ${normalize(p.skillLabel)} `))))reasons.push('Confirm the main skill; its label was unclear.');
  const labels={species:'species',level:'Pokémon level',nature:'nature',skillLevel:'main skill level',carrySize:'carry limit',displayedFrequencySeconds:'helping frequency'};
  for(const [key,label] of Object.entries(labels)){
    if(fields[key]===undefined||fields[key]===null||fields[key]===''){reasons.push(`Missing ${label}.`);continue}
    const values=new Set([...passes.map(p=>p[key]),...readings.flatMap(r=>r.evidence[key]||[]),...(combined.evidence[key]||[])].filter(v=>v!==undefined&&v!==null&&v!==''));
    if(values.size>1)reasons.push(`Conflicting ${label} readings.`);
    if(key==='species'?trusted.species!==fields.species&&pictureSpecies!==fields.species:trusted[key]!==fields[key])reasons.push(`Confirm ${label}; its text was unclear.`);
  }
  for(let i=0;i<5;i++){
    const name=fields.subskills?.[i],values=new Set([...passes.map(p=>p.subskills?.[i]),...combined.evidence.subskills[i]].filter(Boolean));
    if(!name||trusted.subskills?.[i]!==name)reasons.push(`Confirm the Lv. ${[10,25,50,70,80][i]} subskill.`);
    if(values.size>1)reasons.push(`Conflicting Lv. ${[10,25,50,70,80][i]} subskill readings.`);
  }
  for(let i=0;i<3;i++)if(!fields.ingredients?.[i])reasons.push(`Confirm the Lv. ${[1,30,60][i]} ingredient.`);
  if(fields.species==='MEW'&&!fields.mainSkill)reasons.push('Choose Mew’s current main skill.');
  try{new Engine(catalog).validate(fields)}catch(error){reasons.push(error.message)}
  return {ready:reasons.length===0,reasons:[...new Set(reasons)]};
}
