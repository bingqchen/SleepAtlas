export const FAVORITE_MULTIPLIERS=[2,2.4];
// Standard research-area favorites. Greengrass and Expert rolls vary by week;
// Expert's 2.4× berry effect is optional, not an inherent island multiplier.
export const FAVORITE_ISLANDS=[
  {value:'greengrass',label:'Greengrass Isle',berries:null},
  {value:'cyan',label:'Cyan Beach',berries:['ORAN','PECHA','PAMTRE']},
  {value:'taupe',label:'Taupe Hollow',berries:['LEPPA','FIGY','SITRUS']},
  {value:'snowdrop',label:'Snowdrop Tundra',berries:['RAWST','PERSIM','WIKI']},
  {value:'lapis',label:'Lapis Lakeside',berries:['DURIN','MAGO','CHERI']},
  {value:'old-gold',label:'Old Gold Power Plant',berries:['GREPA','BLUK','BELUE']},
  {value:'amber',label:'Amber Canyon',berries:['YACHE','LUM','CHESTO']},
  {value:'greengrass-expert',label:'Greengrass Isle (Expert)',berries:null,favoriteSpeed:10,nonFavoriteSpeed:-15,mainSkillLevelBonus:1},
  {value:'cyan-expert',label:'Cyan Beach (Expert)',berries:null,favoriteSpeed:20,nonFavoriteSpeed:-35,mainSkillLevelBonus:1},
  {value:'custom',label:'Custom / event',berries:null}
];
export function islandFavorites(id){
  const island=FAVORITE_ISLANDS.find(p=>p.value===id);
  if(!island)throw Error('Choose a supported island.');
  return {berries:[...(island.berries||[])],multiplier:2,island:id,...(island.favoriteSpeed?{favoriteSpeed:island.favoriteSpeed,nonFavoriteSpeed:island.nonFavoriteSpeed,mainSkillLevelBonus:island.mainSkillLevelBonus}:{})};
}
const title=value=>value[0].toUpperCase()+value.slice(1).toLowerCase();
export function berryOptions(catalog){
  return [...new Map(catalog.species.map(p=>[p.berry.name,p.berry])).values()]
    .map(b=>({value:b.name,label:`${title(b.name)} (${title(b.type)})`,name:title(b.name)}))
    .sort((a,b)=>a.label.localeCompare(b.label));
}
export function validateFavorites(value,catalog){
  if(value===null)return null;
  const known=new Set(berryOptions(catalog).map(b=>b.value));
  if(!value||!Array.isArray(value.berries)||value.berries.length>3||new Set(value.berries).size!==value.berries.length||value.berries.some(b=>!known.has(b)))throw Error('Choose up to three different berry types.');
  if(!FAVORITE_MULTIPLIERS.includes(value.multiplier))throw Error('Choose a 2× or 2.4× favorite berry multiplier.');
  const result={berries:[...value.berries],multiplier:value.multiplier};
  if(value.island!==undefined){
    const island=FAVORITE_ISLANDS.find(p=>p.value===value.island);
    if(!island)throw Error('Choose a supported island.');
    if(island.berries&&(value.multiplier!==2||value.berries.length!==3||!island.berries.every(b=>value.berries.includes(b))))throw Error('Use this island’s favorite berries or choose Custom / event.');
    result.island=island.value;
  }
  const preset=FAVORITE_ISLANDS.find(p=>p.value===value.island);
  if(value.skillTriggerMultiplier!==undefined){
    if(![1,1.25].includes(value.skillTriggerMultiplier))throw Error('Choose a 1× or 1.25× skill trigger rate.');
    if(preset&&preset.value!=='custom'&&!preset.value.endsWith('-expert')&&value.skillTriggerMultiplier!==1)throw Error('Choose an Expert island or Custom / event for a skill trigger bonus.');
    result.skillTriggerMultiplier=value.skillTriggerMultiplier;
  }
  const skillBonus=value.mainSkillLevelBonus??preset?.mainSkillLevelBonus??0;
  if(![0,1].includes(skillBonus))throw Error('Choose no main skill boost or +1 level.');
  if(preset&&preset.value!=='custom'&&skillBonus!==(preset.mainSkillLevelBonus||0))throw Error('Choose Custom / event to change this island’s main skill boost.');
  if(value.mainSkillLevelBonus!==undefined||preset?.mainSkillLevelBonus!==undefined)result.mainSkillLevelBonus=skillBonus;
  for(const key of ['favoriteSpeed','nonFavoriteSpeed']){
    const speed=value[key]??preset?.[key]??0;
    if(typeof speed!=='number'||!Number.isFinite(speed)||speed < -50||speed > 50)throw Error('Speed changes must be between −50% and +50%.');
    if(preset&&preset.value!=='custom'&&speed!==(preset[key]||0))throw Error('Choose Custom / event to change this island’s speed settings.');
    if(value[key]!==undefined||preset?.[key]!==undefined)result[key]=speed;
  }
  return result;
}
export function favoriteSettings(build,catalog,configuration){
  const favorites=validateFavorites(configuration,catalog);
  if(favorites===null)return build.settings;
  const berry=catalog.species.find(p=>p.name===build.species)?.berry.name;
  const favorite=favorites.berries.includes(berry);
  const speed=berry===favorites.berries[0]?(favorites.favoriteSpeed||0):!favorite?(favorites.nonFavoriteSpeed||0):0;
  return {...build.settings,favoriteBerry:favorite,favoriteBerryMultiplier:favorites.multiplier,helpingFrequencyFactor:1-speed/100};
}
// Context-only effect: never change the saved skill level or intrinsic RP.
export function favoriteSkillLevelBonus(build,catalog,configuration){
  const favorites=validateFavorites(configuration,catalog);
  const berry=catalog.species.find(p=>p.name===build.species)?.berry.name;
  return favorites?.berries[0]===berry?(favorites?.mainSkillLevelBonus||0):0;
}
export function favoriteSkillTriggerMultiplier(build,catalog,configuration){
  const favorites=validateFavorites(configuration,catalog);
  const berry=catalog.species.find(p=>p.name===build.species)?.berry.name;
  return favorites?.berries.includes(berry)?(favorites.skillTriggerMultiplier??1):1;
}
export function describeFavorites(configuration,catalog){
  if(configuration===null)return 'Using each Pokémon’s saved favorite berry settings.';
  const names=new Map(berryOptions(catalog).map(b=>[b.value,b.name]));
  const island=FAVORITE_ISLANDS.find(p=>p.value===configuration.island);
  const prefix=island&&island.value!=='custom'?`${island.label} · `:'';
  const speed=validateFavorites(configuration,catalog),speedText=(speed.favoriteSpeed||speed.nonFavoriteSpeed)?` Help intervals: first favorite ${100-(speed.favoriteSpeed||0)}%; other favorites 100%; non-favorites ${100-(speed.nonFavoriteSpeed||0)}%.`:'';
  const skillText=speed.mainSkillLevelBonus?' Primary favorite: main skill +1 level, up to its maximum.':'';
  const triggerText=speed.skillTriggerMultiplier===1.25?' All favorite types: 1.25× skill trigger chance.':'';
  return (configuration.berries.length
    ?`${prefix}Favorite berries: ${configuration.berries.map(b=>names.get(b)).join(', ')} · ${configuration.multiplier}× berry strength.`
    :`${prefix}No favorite berries selected. All berries use ordinary strength.`)+speedText+skillText+triggerText;
}
