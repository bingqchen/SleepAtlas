import {parseOCR,readDisplayedFrequency} from './ocr-parser.js';

export const SUBSKILL_LEVELS=[10,25,50,70,80];
export const subskillSlots=build=>SUBSKILL_LEVELS.map((level,i)=>({level,name:build.subskills?.[i]||'Unknown',unlocked:build.level>=level}));
export function formatFrequency(seconds){
  if(!Number.isInteger(seconds)||seconds<1)return 'Not recorded';
  const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
  return `Every ${hours?`${hours} hr `:''}${minutes} min ${rest} sec`;
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
