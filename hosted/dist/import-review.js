import {parseOCR} from './ocr-parser.js';
import {Engine} from './engine.js';
import {calculatedStats} from './pokemon-stats.js';

// A foreign-language nickname can lower an entire header line's OCR score.
// Use confidence on the actual Lv. token/digits, with the portrait-header bounds.
export function confidentHeaderLevels(images){
  const levels=new Set();
  for(const image of images)for(const line of image.lines||[]){
    const words=line.words||[];
    for(let i=0;i<words.length;i++){
      const word=words[i];
      if(word.confidence<.75||![word.confidence,word.x,word.y].every(Number.isFinite)||word.x<.15||word.x>=.4||word.y<0||word.y>=.3)continue;
      const inline=word.text.trim().match(/^(?:Lv\.?|Level|v\.)\s*(\d{1,3})$/i);
      let level=inline?Number(inline[1]):null;
      if(!inline&&/^(?:Lv\.?|Level|v\.)$/i.test(word.text.trim())){
        const next=words[i+1];
        if(next?.confidence>=.75&&/^\d{1,3}$/.test(next.text.trim())&&next.x>=word.x&&next.x<.45&&next.x-(word.x+(word.w||0))<.035&&Math.abs(next.y-word.y)<.015)level=Number(next.text.trim());
      }
      if(Number.isInteger(level)&&level>=1&&level<=100)levels.add(level);
    }
  }
  return [...levels];
}
const present=value=>value!==undefined&&value!==null&&value!=='';

// Corroborate an existing header reading; never infer a missing level from speed.
// Search every supported level, including future speed-subskill unlocks, so a
// match cannot merely be the nearest result to the OCR guess. Ignore island/team
// settings: this is the Pokémon's displayed detail-screen interval.
function frequencyLevelCheck(fields,catalog,{pictureSpecies,trusted,combined,readings,values,strongLevels,images}){
  if(pictureSpecies!==fields.species||!pictureSpecies||!Number.isInteger(fields.level)||fields.level<1||fields.level>100||!values('level').has(fields.level))return null;
  if(values('level').size!==1||[...strongLevels].some(level=>level!==fields.level))return null;
  const text=combined.text.replace(/\s+/g,' '),nature=catalog.natures.find(n=>n.name===fields.nature);
  // The two effect lines can surround the nature name in OCR reading order.
  // Pair them by their position in the right-hand nature panel as well as text.
  const noNatureEffect=/this nature has no effect/i.test(text)||images.some(image=>image.lines.some(line=>line.x>=.45&&line.y>=.7&&/this\s+nature\s+has\b/i.test(line.text)&&image.lines.some(next=>/no\s+effect\b/i.test(next.text)&&Math.abs(next.x-line.x)<.12&&next.y>=line.y-.01&&next.y-line.y<.06)));
  if(fields.frequencySource==='calculated'||/\b(?:ribbon|mint|good camp|helper boost)\b/i.test(text)||nature?.frequency!==1&&noNatureEffect)return null;
  for(const key of ['nature','displayedFrequencySeconds'])if(!present(fields[key])||trusted[key]!==fields[key]||values(key).size!==1||combined.fields[key]!==fields[key])return null;
  for(let i=0;i<5;i++){
    const names=new Set([...readings.flatMap(r=>[r.fields.subskills?.[i],...r.evidence.subskills[i]]),...combined.evidence.subskills[i]].filter(Boolean));
    if(!fields.subskills?.[i]||trusted.subskills?.[i]!==fields.subskills[i]||names.size!==1)return null;
  }
  const matches=[];
  for(let level=1;level<=100;level++){
    const seconds=calculatedStats(catalog,{...fields,level,settings:{helpingFrequencyFactor:1}}).frequencySeconds;
    if(Number.isFinite(seconds)&&Math.abs(seconds-fields.displayedFrequencySeconds)<=1)matches.push(level);
  }
  return matches.length===1&&matches[0]===fields.level?{method:'helping-frequency',level:fields.level,seconds:fields.displayedFrequencySeconds}:null;
}

// Require field-level evidence. An average OCR score can hide a missing or
// misread stat, so only matching readings from confident lines qualify.
export function assessImport(result,images,catalog,{pictureSpecies=null,issues=[]}={}){
  const fields=result.fields,reasons=[...issues],trustedResult=parseOCR(images.map(image=>({lines:image.lines.filter(l=>l.confidence>=.75)})),catalog),trusted=trustedResult.fields;
  const readings=images.flatMap(image=>(image.passes||[image.lines]).map(lines=>parseOCR([{lines}],catalog))),passes=readings.map(r=>r.fields);
  const combined=parseOCR(images,catalog);
  const values=key=>new Set([...passes.map(p=>p[key]),...readings.flatMap(r=>r.evidence[key]||[]),...(combined.evidence[key]||[])].filter(present));
  const strongLevels=new Set([...trustedResult.evidence.level,...confidentHeaderLevels(images),...images.flatMap(image=>(image.passes||[]).flatMap(lines=>[...parseOCR([{lines:lines.filter(l=>l.confidence>=.75)}],catalog).evidence.level,...confidentHeaderLevels([{lines}])]))]);
  const levelVerification=frequencyLevelCheck(fields,catalog,{pictureSpecies,trusted,combined,readings,values,strongLevels,images});
  // A species-looking header can itself be a nickname. Never auto-save a
  // text-only species guess when the portrait was ambiguous or unavailable.
  if(!pictureSpecies||pictureSpecies!==fields.species)reasons.push('Confirm the species; the portrait could not be verified.');
  const p=catalog.species.find(p=>p.name===fields.species),normalize=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(p&&!images.some(image=>image.lines.some(l=>l.confidence>=.75&&l.y>.3&&l.y<.7&&` ${normalize(l.text)} `.includes(` ${normalize(p.skillLabel)} `))))reasons.push('Confirm the main skill; its label was unclear.');
  const labels={species:'species',level:'Pokémon level',nature:'nature',skillLevel:'main skill level',carrySize:'carry limit',displayedFrequencySeconds:'helping frequency'};
  for(const [key,label] of Object.entries(labels)){
    if(!present(fields[key])){reasons.push(`Missing ${label}.`);continue}
    const readings=values(key);
    if(key==='level')for(const level of strongLevels)readings.add(level);
    if(readings.size>1)reasons.push(`Conflicting ${label} readings.`);
    const confirmed=key==='species'?trusted.species===fields.species||pictureSpecies===fields.species:key==='level'?trusted.level===fields.level||strongLevels.size===1&&strongLevels.has(fields.level)||!!levelVerification:trusted[key]===fields[key];
    if(!confirmed)reasons.push(`Confirm ${label}; its text was unclear.`);
  }
  for(let i=0;i<5;i++){
    const name=fields.subskills?.[i],values=new Set([...passes.map(p=>p.subskills?.[i]),...combined.evidence.subskills[i]].filter(Boolean));
    if(!name||trusted.subskills?.[i]!==name)reasons.push(`Confirm the Lv. ${[10,25,50,70,80][i]} subskill.`);
    if(values.size>1)reasons.push(`Conflicting Lv. ${[10,25,50,70,80][i]} subskill readings.`);
  }
  for(let i=0;i<3;i++)if(!fields.ingredients?.[i])reasons.push(`Confirm the Lv. ${[1,30,60][i]} ingredient.`);
  if(fields.species==='MEW'&&!fields.mainSkill)reasons.push('Choose Mew’s current main skill.');
  try{new Engine(catalog).validate(fields)}catch(error){reasons.push(error.message)}
  return {ready:reasons.length===0,reasons:[...new Set(reasons)],...(levelVerification?{levelVerification}:{} )};
}
