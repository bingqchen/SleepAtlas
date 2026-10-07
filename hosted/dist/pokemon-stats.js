import {parseOCR,readDisplayedFrequency} from './ocr-parser.js';
import {pythonRound4} from './engine.js';
import {speciesChoices} from './evolution.js';

export const SUBSKILL_LEVELS=[10,25,50,70,80];
export const subskillSlots=build=>SUBSKILL_LEVELS.map((level,i)=>({level,name:build.subskills?.[i]||'Unknown',unlocked:build.level>=level}));
export function calculatedStats(catalog,build){
  const p=catalog.species.find(p=>p.name===build.species),nature=catalog.natures.find(n=>n.name===build.nature);
  if(!p||!Number.isInteger(build.level)||build.level<1||build.level>100)return {frequencySeconds:null,carrySize:null};
  const active=subskillSlots(build).filter(s=>s.unlocked).map(s=>s.name);
  const bonus=name=>active.includes(name)?catalog.subskills.find(s=>s.name===name)?.amount||0:0;
  // The detail-screen frequency excludes Helping Bonus and team/energy effects.
  const speed=bonus('Helping Speed S')+bonus('Helping Speed M');
  const frequencySeconds=nature?Math.floor(pythonRound4((1-.002*(build.level-1))*(2-nature.frequency)*(1-speed))*p.frequency):null;
  const carrySize=p.carrySize+5*p.previousEvolutions+bonus('Inventory Up S')+bonus('Inventory Up M')+bonus('Inventory Up L');
  return {frequencySeconds,carrySize};
}
export function updatedCarrySize(catalog,build,anchor){
  const current=calculatedStats(catalog,build).carrySize;
  if(current===null)return null;
  const previous=anchor&&calculatedStats(catalog,anchor).carrySize;
  const related=anchor&&speciesChoices(catalog,anchor.species).some(p=>p.name===build.species);
  // Keep recorded ribbon/other additive bonuses through an evolution or unlock.
  // Always use the anchor, so repeated selection changes cannot accumulate them.
  const extra=related&&previous!==null&&Number.isInteger(anchor.carrySize)&&anchor.carrySize>0?anchor.carrySize-previous:0;
  return Math.max(1,Math.min(200,current+extra));
}
export function formatFrequency(seconds){
  if(!Number.isInteger(seconds)||seconds<1)return 'Not recorded';
  return `${Math.floor(seconds/60)}′${String(seconds%60).padStart(2,'0')}″`;
}
export function withRecordedFrequency(build,screenshots,catalog){
  // Explicit null means the user cleared the reading. Do not recover it again.
  if(Object.hasOwn(build,'displayedFrequencySeconds'))return build;
  const matching=(screenshots||[]).map(p=>({lines:p.text||[]})).filter(image=>{
    const f=parseOCR([image],catalog).fields;
    // Old screenshots can survive a level or subskill upgrade. Only recover a
    // reading when the visible build still matches all stored stat inputs.
    return f.level===build.level&&f.nature===build.nature&&(!f.species||f.species===build.species)&&f.subskills.every((s,i)=>s===build.subskills[i]);
  });
  const frequency=readDisplayedFrequency(matching);
  return frequency.seconds===null?build:{...build,displayedFrequencySeconds:frequency.seconds};
}
