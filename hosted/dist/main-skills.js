// Mew's learned effects from the official Versatile announcement. An unset
// choice keeps legacy Mew records unresolved rather than guessing their skill.
export const MEW_SKILLS=['Metronome','Charge Strength S','Charge Strength S (random)','Charge Strength M','Dream Shard Magnet S','Ingredient Magnet S','Energizing Cheer S','Charge Energy S','Energy For Everyone S','Tasty Chance S','Cooking Power-Up S','Extra Helpful S','Berry Burst'];
export function mainSkillOptions(catalog,species){
  if(species!=='MEW')return [];
  return MEW_SKILLS.map(name=>({value:name,label:name==='Charge Strength S'?'Charge Strength S (fixed)':name}));
}
export function resolveMainSkill(catalog,build,{levelBonus=0}={}){
  if(![0,1].includes(levelBonus))throw Error('Main skill level bonus must be 0 or 1.');
  const p=catalog.species.find(p=>p.name===build.species);
  const selected=p?.name==='MEW'&&MEW_SKILLS.includes(build.mainSkill)
    ?catalog.species.find(p=>p.skill.name===build.mainSkill.replace(' (random)','')&&!p.skill.modifierName&&(build.mainSkill.startsWith('Charge Strength S')?Boolean(p.skill.strengthAmountsMean)===build.mainSkill.endsWith(' (random)'):true)):null;
  const skill=selected?.skill||p?.skill,label=selected?(build.mainSkill==='Charge Strength S'?'Charge Strength S (fixed)':build.mainSkill):p?.skillLabel||'Choose a species';
  return {skill,label,effectiveLevel:Math.min((build.skillLevel||1)+levelBonus,skill?.RP?.length||7)};
}

export function skillLevelOptions(catalog,build){
  const {skill}=resolveMainSkill(catalog,build);
  return Array.from({length:skill?.RP?.length||0},(_,i)=>i+1);
}
