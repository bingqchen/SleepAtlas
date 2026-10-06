const UNLOCKS=[10,25,50,70,80];
const upgrades=[['Helping Speed S','Helping Speed M'],['Ingredient Finder S','Ingredient Finder M'],['Inventory Up S','Inventory Up M','Inventory Up L'],['Skill Level Up S','Skill Level Up M'],['Skill Trigger S','Skill Trigger M']];
const sameArray=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
function sameOrUpgrade(before,after){
  if(before===after)return true;
  return upgrades.some(family=>family.includes(before)&&family.indexOf(after)>family.indexOf(before));
}
export function matchesProgression(before,after,catalog){
  if(before.species!==after.species||before.nature!==after.nature||!sameArray(before.ingredients,after.ingredients))return false;
  if((before.mainSkill||'')!==(after.mainSkill||''))return false;
  // Unknown slots must match exactly; they are never wildcards for known skills.
  if(before.subskills?.length!==5||after.subskills?.length!==5||!before.subskills.every((s,i)=>sameOrUpgrade(s,after.subskills[i])))return false;
  const activeBonus=(build,prefix)=>build.subskills.reduce((sum,name,i)=>sum+(build.level>=UNLOCKS[i]&&name.startsWith(prefix)?catalog.subskills.find(s=>s.name===name)?.amount||0:0),0);
  const inventoryChange=activeBonus(after,'Inventory Up')-activeBonus(before,'Inventory Up');
  if(before.carrySize!==after.carrySize&&after.carrySize!==before.carrySize+inventoryChange)return false;
  const skillChange=activeBonus(after,'Skill Level Up')-activeBonus(before,'Skill Level Up');
  const maxSkill=catalog.species.find(p=>p.name===after.species)?.skill?.RP?.length||7;
  if(before.skillLevel!==after.skillLevel&&after.skillLevel!==Math.min(maxSkill,before.skillLevel+skillChange))return false;
  return true;
}
