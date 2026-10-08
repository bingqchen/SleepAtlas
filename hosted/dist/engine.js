import {MEW_SKILLS,resolveMainSkill} from './main-skills.js';
// Base formulas ported from atlas-1.3, with selectable favorite berry bonuses.
// Reference samples are identical to the Python model.
export const MODEL_VERSION='atlas-1.6-web';
export const favoriteMultiplier=settings=>settings.favoriteBerry?(settings.favoriteBerryMultiplier??2):1;
export const berryValueAtLevel=(berry,level)=>Math.floor(Math.max(berry.value+level-1,berry.value*1.025**(level-1))+.5);
export const hasTeamBerryBurst=skill=>skill?.name==='Berry Burst'&&!skill.modifierName;
export function ownSkillBerries(skill,level){
  // Solo baselines from the pinned Neroli's Lab skill definitions. Team bonuses
  // and Disguise's sleep-reset Great Success are deliberately excluded.
  const amounts=skill.modifierName==='Draco Meteor'?[12,21,29,38,43,48]:skill.modifierName==='Lunar Blessing'?[5,9,13,17,21,25]:skill.selfBerryAmounts;
  return amounts?.[level-1]||0;
}
const UNLOCKS=[10,25,50,70,80];
const numeric=(value,name,min,max,integer=false)=>{
  if(typeof value==='boolean'||value===null||value===''||!['number','string'].includes(typeof value))throw Error(`${name} must be a number.`);
  const n=Number(value);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error(`${name} must be ${integer?'a whole number ':''}between ${min} and ${max}.`);return n;
};
const evenRound=x=>{const n=Math.floor(x),f=x-n;return Math.abs(f-.5)<1e-10?n+(n%2):Math.round(x)};
// Python rounds the original IEEE-754 value, before decimal scaling. Preserve
// that behavior at half boundaries so a help interval cannot drift by a second.
const roundBuffer=new DataView(new ArrayBuffer(8));
export function pythonRound4(x){
  roundBuffer.setFloat64(0,x);const bits=roundBuffer.getBigUint64(0),exp=Number((bits>>52n)&2047n)-1023-52;
  let numerator=((bits&((1n<<52n)-1n))+(1n<<52n))*10000n,denominator=1n;
  if(exp>=0)numerator<<=BigInt(exp);else denominator<<=BigInt(-exp);
  let q=numerator/denominator;const r=numerator%denominator;
  if(r*2n>denominator||(r*2n===denominator&&q%2n))q++;return Number(q)/10000;
}
export function skillExpectation(helps,chance,cap){
  const at=n=>n<=0?0:cap===1?1-(1-chance)**n:2-2*(1-chance)**n-n*chance*(1-chance)**(n-1);
  const n=Math.floor(helps);return at(n)+(helps-n)*(at(n+1)-at(n));
}
export class Engine{
  constructor(catalog){this.catalog=catalog;this.species=new Map(catalog.species.map(p=>[p.name,p]));this.natures=new Map(catalog.natures.map(p=>[p.name,p]));this.subskills=new Map(catalog.subskills.map(p=>[p.name,p]));}
  validate(raw){
    if(!raw||typeof raw!=='object')throw Error('Expected Pokémon details.');
    const p=this.species.get(raw.species);if(!p)throw Error('Choose a supported species.');
    if(!this.natures.has(raw.nature))throw Error('Choose a nature.');
    const level=numeric(raw.level,'Level',1,100,true),skillLevel=numeric(raw.skillLevel,'Main skill level',1,p.skill.RP?.length||7,true);
    const selected={};
    if(raw.mainSkill!==undefined&&raw.mainSkill!==null&&raw.mainSkill!==''){
      if(p.name!=='MEW'||!MEW_SKILLS.includes(raw.mainSkill))throw Error('Choose a supported main skill for Mew.');
      selected.mainSkill=raw.mainSkill;
    }
    if(raw.mewSkillChance!==undefined){
      if(p.name!=='MEW')throw Error('A custom Mew skill chance is only available for Mew.');
      selected.mewSkillChance=numeric(raw.mewSkillChance,'Assumed Mew skill chance (%)',.01,100);
    }
    if(!Array.isArray(raw.subskills)||raw.subskills.length!==5||raw.subskills.some(s=>typeof s!=='string'||(s&&!this.subskills.has(s))))throw Error('Choose five valid subskill slots (or leave a slot unknown).');
    const chosen=raw.subskills.filter(Boolean);if(new Set(chosen).size!==chosen.length)throw Error('Each subskill can appear only once.');
    if(!Array.isArray(raw.ingredients)||raw.ingredients.length!==3)throw Error('Choose an ingredient for each unlock level.');
    [0,30,60].forEach((lv,i)=>{if(!p[`ingredient${lv}`].some(x=>x.ingredient.name===raw.ingredients[i]))throw Error(`Invalid ingredient for the level ${lv||1} slot.`)});
    const settings={...this.catalog.defaults},incoming=raw.settings??{};
    if(typeof incoming!=='object'||Array.isArray(incoming))throw Error('Invalid analysis settings.');
    for(const [key,low,high] of [['energyMultiplier',1,2.5],['sleepHours',0,12],['collectionHours',.25,12],['areaBonus',0,100],['teamHelpingBonus',0,4]])settings[key]=numeric(incoming[key]??settings[key],key,low,high,key==='teamHelpingBonus');
    if(typeof(incoming.favoriteBerry??false)!=='boolean')throw Error('Favorite berry must be true or false.');settings.favoriteBerry=incoming.favoriteBerry??false;
    if(incoming.favoriteBerryMultiplier!==undefined){if(![2,2.4].includes(incoming.favoriteBerryMultiplier))throw Error('Favorite berry multiplier must be 2 or 2.4.');settings.favoriteBerryMultiplier=incoming.favoriteBerryMultiplier}
    if(incoming.helpingFrequencyFactor!==undefined)settings.helpingFrequencyFactor=numeric(incoming.helpingFrequencyFactor,'Island help interval factor',.5,1.5);
    const nickname=raw.nickname||p.displayName,notes=raw.notes??'';
    if(typeof nickname!=='string'||nickname.length>80)throw Error('Name must contain at most 80 characters.');
    if(typeof notes!=='string'||notes.length>4000)throw Error('Notes must contain at most 4,000 characters.');
    const recorded=Object.hasOwn(raw,'displayedFrequencySeconds')?{displayedFrequencySeconds:raw.displayedFrequencySeconds===null?null:numeric(raw.displayedFrequencySeconds,'Displayed helping frequency (seconds)',1,86400,true)}:{};
    if(raw.frequencySource!==undefined){if(!['recorded','calculated'].includes(raw.frequencySource))throw Error('Invalid helping frequency source.');recorded.frequencySource=raw.frequencySource}
    return {species:raw.species,nickname:nickname.trim()||p.displayName,nature:raw.nature,level,skillLevel,subskills:[...raw.subskills],ingredients:[...raw.ingredients],settings,notes,carrySize:numeric(raw.carrySize??p.carrySize,'Carry limit',1,200,true),...recorded,...selected};
  }
  calculate(build,level=build.level,{berryTeam=null}={}){
    const p=this.species.get(build.species),nature=this.natures.get(build.nature),active=build.subskills.filter((s,i)=>s&&level>=UNLOCKS[i]),settings=build.settings;
    const bonus=name=>active.includes(name)?this.subskills.get(name).amount:0;
    const speed=Math.min(.35,bonus('Helping Speed S')+bonus('Helping Speed M')+bonus('Helping Bonus')+.05*settings.teamHelpingBonus);
    const frequency=Math.floor(pythonRound4((1-.002*(level-1))*(2-nature.frequency)*(1-speed))*(p.frequency*(settings.helpingFrequencyFactor??1)));
    const helpsPerHour=3600/frequency*settings.energyMultiplier;
    const ingRate=Math.min(1,p.ingredientPercentage/100*nature.ingredient*(1+bonus('Ingredient Finder S')+bonus('Ingredient Finder M')));
    const skillRate=Math.min(.999999,(p.name==='MEW'?(build.mewSkillChance??p.skillPercentage):p.skillPercentage)/100*nature.skill*(1+bonus('Skill Trigger S')+bonus('Skill Trigger M')));
    const berryAmount=(['berry','all'].includes(p.specialty)?2:1)+bonus('Berry Finding S'),slots=[],possible=new Map();
    [0,30,60].forEach((lv,i)=>{for(const x of p[`ingredient${lv}`])possible.set(x.ingredient.name,x.ingredient);if(level>=(lv||1))slots.push(p[`ingredient${lv}`].find(x=>x.ingredient.name===build.ingredients[i]))});
    const mean=slots.reduce((s,x)=>s+x.amount,0)/slots.length,itemsPerHelp=ingRate*mean+(1-ingRate)*berryAmount;
    let carry=build.carrySize;
    if(level!==build.level){const now=build.subskills.filter((s,i)=>s&&build.level>=UNLOCKS[i]);for(const s of active)if(!now.includes(s)&&s.startsWith('Inventory Up'))carry+=this.subskills.get(s).amount;for(const s of now)if(!active.includes(s)&&s.startsWith('Inventory Up'))carry-=this.subskills.get(s).amount;carry=Math.max(1,carry)}
    let hours=24-settings.sleepHours;const intervals=[];
    while(hours>1e-8){const duration=Math.min(settings.collectionHours,hours);intervals.push(duration);hours-=duration}if(settings.sleepHours>0)intervals.push(settings.sleepHours);
    let normalHelps=0,overflow=0,triggers=0;
    for(const duration of intervals){const helps=duration*helpsPerHour,effective=Math.min(helps,carry/itemsPerHelp);normalHelps+=effective;overflow+=helps-effective;triggers+=skillExpectation(effective,skillRate,['skill','all'].includes(p.specialty)?2:1)}
    const quantities=new Map([...possible.keys()].map(k=>[k,0]));for(const slot of slots){const name=slot.ingredient.name;quantities.set(name,quantities.get(name)+normalHelps*ingRate/slots.length*slot.amount)}
    const {skill,label:skillLabel,effectiveLevel}=resolveMainSkill(this.catalog,build);
    const gatheredBerryCount=(normalHelps*(1-ingRate)+overflow)*berryAmount,skillBerriesPerTrigger=ownSkillBerries(skill,effectiveLevel),ownSkillBerryCount=triggers*skillBerriesPerTrigger;
    const berryValue=berryValueAtLevel(p.berry,level),area=1+settings.areaBonus/100,ownValue=berryValue*favoriteMultiplier(settings);
    const teamBerrySkill=hasTeamBerryBurst(skill),teamBerryMode=teamBerrySkill?(berryTeam===null?'automatic':'selected'):null;
    let teammates=[];
    if(teamBerrySkill){
      if(berryTeam===null)teammates=Array.from({length:4},()=>({species:build.species,level,favoriteMultiplier:favoriteMultiplier(settings)}));
      else{
        if(!Array.isArray(berryTeam)||berryTeam.length>4)throw Error('Choose up to four teammates.');
        teammates=berryTeam.map(member=>{
          if(!member||!this.species.has(member.species)||![1,2,2.4].includes(member.favoriteMultiplier))throw Error('Invalid teammate berry settings.');
          return {...member,level:numeric(member.level,'Teammate level',1,100,true)};
        });
      }
    }
    const teamAmount=teamBerrySkill?skill.teamBerryAmounts[effectiveLevel-1]:0,teamBerriesPerTrigger=teamAmount*teammates.length;
    const teamSkillBerryCount=triggers*teamBerriesPerTrigger,teamSkillBerryStrength=triggers*teamAmount*teammates.reduce((sum,m)=>sum+berryValueAtLevel(this.species.get(m.species).berry,m.level)*m.favoriteMultiplier,0)*area;
    const ownSkillBerryStrength=ownSkillBerryCount*ownValue*area,skillBerryCount=ownSkillBerryCount+teamSkillBerryCount,skillBerryStrength=ownSkillBerryStrength+teamSkillBerryStrength;
    const berries=gatheredBerryCount+skillBerryCount,berryStrength=gatheredBerryCount*ownValue*area+skillBerryStrength,ingredientStrength=[...possible].reduce((s,[k,v])=>s+quantities.get(k)*v.value,0)*area;
    const index=effectiveLevel-1,direct=skill.strengthAmountsMean||skill.strengthAmounts,supported=!!direct&&!skill.modifierName;
    const skillStrength=supported?triggers*direct[index]*area:0,randomIngredients=skill.name==='Ingredient Magnet S'&&!skill.modifierName?triggers*skill.ingredientAmounts[index]:0;
    return {level,skillTriggers:triggers,strength:berryStrength+ingredientStrength+skillStrength,ingredientCount:[...quantities.values()].reduce((a,b)=>a+b,0),randomIngredients,berryCount:berries,gatheredBerryCount,skillBerryCount,skillBerryStrength,skillBerriesPerTrigger,ownSkillBerryCount,ownSkillBerryStrength,teamSkillBerryCount,teamSkillBerryStrength,teamBerriesPerTrigger,teamBerryMode,teamMemberCount:teammates.length,berrySkill:skillBerriesPerTrigger>0,berryStrength,ingredientStrength,skillStrength,frequencySeconds:frequency,ingredientRate:ingRate,skillRate,activeSubskills:active.sort(),ingredients:[...quantities].map(([name,count])=>({name,longName:possible.get(name).longName,count,strength:count*possible.get(name).value*area})),supportSkillExcluded:!supported||!['Charge Strength S','Charge Strength M'].includes(skill.name),normalHelps,sneakyHelps:overflow};
  }
  analyze(raw,context={}){
    const build=this.validate(raw),current=this.calculate(build,build.level,context),p=this.species.get(build.species),keys=['skillTriggers','strength','ingredientCount','berryCount'];
    const reference=Object.fromEntries(keys.map(k=>[k,[]])),ingredients=new Map();
    const inv=b=>b.subskills.reduce((n,s,i)=>n+(s&&UNLOCKS[i]<=b.level&&s.startsWith('Inventory Up')?this.subskills.get(s).amount:0),0);
    const baseCarry=Math.max(1,build.carrySize-inv(build));
    for(const sample of this.catalog.referenceBuilds){const b={...build,...sample};b.carrySize=baseCarry+inv(b);const r=this.calculate(b,b.level,context);for(const key of keys)reference[key].push(r[key]);for(const item of r.ingredients){if(!ingredients.has(item.name))ingredients.set(item.name,[]);ingredients.get(item.name).push(item.count)}}
    const percentile=(value,values)=>evenRound(100*values.reduce((n,x)=>n+(x<value-1e-7?1:Math.abs(x-value)<=1e-7?.5:0),0)/values.length);
    current.ratings=Object.fromEntries(keys.map(k=>[k,percentile(current[k],reference[k])]));for(const item of current.ingredients)item.rating=item.count?percentile(item.count,ingredients.get(item.name)):null;
    const forecasts=[30,60,70,80].filter(l=>l>build.level).map(l=>this.calculate(build,l,context)),ingredientAlternatives=[];
    for(const s30 of p.ingredient30)for(const s60 of p.ingredient60){const variant={...build,ingredients:[build.ingredients[0],s30.ingredient.name,s60.ingredient.name]},r=this.calculate(variant,60,context);ingredientAlternatives.push({slots:variant.ingredients,ingredients:r.ingredients,ingredientCount:r.ingredientCount,strength:r.strength})}
    const {skill,label:skillLabel,effectiveLevel}=resolveMainSkill(this.catalog,build);
    const warnings=[];if(build.subskills.some((s,i)=>!s&&UNLOCKS[i]<=build.level))warnings.push('Some unlocked subskills are unknown; those slots contribute no bonus.');
    if(p.name==='MEW'){
      warnings.push(`Mew estimates are provisional: base skill chance is assumed to be ${build.mewSkillChance??p.skillPercentage}%, and the catalog ingredient rate is unverified. Actual skill chance varies with the selected skill. Adjust the assumption in the editor.`);
      if(!build.mainSkill)warnings.push('Choose Mew’s current main skill in Edit & recalculate to include its modeled effect.');
      if(effectiveLevel<build.skillLevel)warnings.push(`${skillLabel} uses its current maximum of Lv. ${effectiveLevel}; Mew’s stored skill level remains ${build.skillLevel}.`);
    }
    if(current.berrySkill){
      warnings.push(current.teamBerryMode?`${skillLabel}: ${current.skillBerriesPerTrigger} own + ${current.teamBerriesPerTrigger} teammate berries per trigger. ${current.teamBerryMode==='automatic'?'Automatic estimate assumes four teammates at this Pokémon’s level, berry type, and favorite bonus.':'Uses the selected teammates’ levels, berry types, and favorite bonuses; empty or missing slots contribute zero.'}`:`${skillLabel}: counts ${current.skillBerriesPerTrigger} of this Pokémon’s own berries per trigger. Teammates’ berries and other skill effects are excluded.`);
      if(p.skill.modifierName==='Disguise')warnings.push('Disguise uses normal bursts; the sleep-reset Great Success bonus is excluded.');
      if(p.skill.modifierName==='Draco Meteor')warnings.push('Draco Meteor assumes one Dragon species and no Latias bonus.');
      if(p.skill.modifierName==='Lunar Blessing')warnings.push('Lunar Blessing assumes one Psychic species; energy support is excluded.');
    }else if(current.supportSkillExcluded)warnings.push(`${skillLabel} triggers are estimated, but its indirect/team effects are excluded from strength.`);
    if(current.randomIngredients)warnings.push('Ingredient Magnet bonus items are shown separately. Their types and strength depend on your unlocked ingredients.');
    if(build.level>70)warnings.push('Levels above 70 are hypothetical projections, not a claim about the current in-game level cap.');
    return {build,current,forecasts,ingredientAlternatives,warnings,modelVersion:MODEL_VERSION,catalogCommit:this.catalog.commit,referenceCount:this.catalog.referenceBuilds.length};
  }
}
