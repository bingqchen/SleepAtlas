/**
 * RP formulas adapted from Neroli’s Lab (Copyright 2025 Neroli's Lab Authors).
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by law or agreed in writing, distributed AS IS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License
 * for permissions and limitations. Modified for Sleep Atlas build data,
 * selected Mew effects, and explicit unavailable RP above verified levels.
 * Source: common/src/utils/rp-utils/rp.ts at 74e5068c1fa76518803caa8705798389da7f635d
 */
import {resolveMainSkill} from './main-skills.js';
const GROWTH=[null,1.0,1.003,1.007,1.011,1.016,1.021,1.027,1.033,1.039,1.046,1.053,1.061,1.069,1.077,1.085,1.094,1.104,1.114,1.124,1.134,1.145,1.156,1.168,1.18,1.192,1.205,1.218,1.231,1.245,1.259,1.274,1.288,1.303,1.319,1.335,1.351,1.368,1.385,1.402,1.42,1.439,1.457,1.477,1.496,1.517,1.537,1.558,1.58,1.602,1.625,1.648,1.671,1.696,1.72,1.745,1.771,1.798,1.824,1.852,1.88,1.927,1.975,2.024,2.075,2.127,2.18,2.235,2.29,2.348,2.406];
const WEIGHTS={'Dream Shard Bonus':.221,'Energy Recovery Bonus':.221,'Helping Bonus':.221,'Research EXP Bonus':.221,'Sleep EXP Bonus':.221,'Inventory Up S':.071,'Inventory Up M':.139,'Inventory Up L':.181};
export function rpFloor(value,decimals){
  const factor=10**decimals,shifted=value*factor,nearest=Math.round(shifted);
  return Math.floor(Math.abs(shifted-nearest)<1e-10?nearest:shifted)/factor;
}
// RP deliberately ignores routine, favorite berries, island effects, carry
// readings, team composition and displayed frequency. Ribbon bonus is unknown.
export function rpComponents(catalog,build,level=build.level){
  const p=catalog.species.find(p=>p.name===build.species),nature=catalog.natures.find(n=>n.name===build.nature);
  if(!p||!nature||!GROWTH[level]||(p.name==='MEW'&&!build.mainSkill))return null;
  const active=new Set(build.subskills.filter((s,i)=>s&&level>=[10,25,50,70,80][i]));
  const bonus=name=>active.has(name)?catalog.subskills.find(s=>s.name===name).amount:0;
  const speed=Math.max(.65,1-bonus('Helping Speed M')-bonus('Helping Speed S'));
  const helps=5*rpFloor(3600/(p.frequency*rpFloor((1-.002*(level-1))*(Math.round((2-nature.frequency)*1000)/1000)*speed,4)),2);
  const ingredientChance=rpFloor(p.ingredientPercentage/100*nature.ingredient*Math.round((1+bonus('Ingredient Finder M')+bonus('Ingredient Finder S'))*100)/100,4);
  const skillChance=rpFloor((p.name==='MEW'?(build.mewSkillChance??p.skillPercentage):p.skillPercentage)/100*Math.round((1+bonus('Skill Trigger M')+bonus('Skill Trigger S'))*100)/100*nature.skill,4);
  const slots=[0,30,60].flatMap((unlock,i)=>level>=unlock?[p[`ingredient${unlock}`].find(s=>s.ingredient.name===build.ingredients[i])]:[]);
  const ingredientValue=Math.floor(slots.reduce((sum,s)=>sum+s.amount*s.ingredient.value,0)/slots.length);
  const ingredients=rpFloor(helps*ingredientChance*ingredientValue*GROWTH[level],2);
  const berryCount=(['berry','all'].includes(p.specialty)?2:1)+bonus('Berry Finding S');
  const berryValue=berryCount*Math.max(p.berry.value+level-1,Math.round(p.berry.value*1.025**(level-1)));
  const berries=rpFloor(helps*(1-ingredientChance)*berryValue,2);
  const {skill,effectiveLevel}=resolveMainSkill(catalog,build),skillValue=skill?.RP?.[effectiveLevel-1];
  if(!Number.isFinite(skillValue))return null;
  const skillRP=rpFloor(helps*skillChance*skillValue,2);
  const energy=nature.energy<1?.92:nature.energy>1?1.08:1;
  const misc=rpFloor(energy*[...active].reduce((value,s)=>value+(WEIGHTS[s]||0),1),2);
  return {value:Math.round(misc*(ingredients+berries+skillRP)),helps,ingredientChance,skillChance,ingredients,berries,skill:skillRP,misc};
}
export const calculateRP=(catalog,build,level=build.level)=>rpComponents(catalog,build,level)?.value??null;
