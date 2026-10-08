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
  {value:'greengrass-expert',label:'Greengrass Isle (Expert)',berries:null},
  {value:'cyan-expert',label:'Cyan Beach (Expert)',berries:null},
  {value:'custom',label:'Custom / event',berries:null}
];
export function islandFavorites(id){
  const island=FAVORITE_ISLANDS.find(p=>p.value===id);
  if(!island)throw Error('Choose a supported island.');
  return {berries:[...(island.berries||[])],multiplier:2,island:id};
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
  return result;
}
export function favoriteSettings(build,catalog,configuration){
  const favorites=validateFavorites(configuration,catalog);
  if(favorites===null)return build.settings;
  const berry=catalog.species.find(p=>p.name===build.species)?.berry.name;
  return {...build.settings,favoriteBerry:favorites.berries.includes(berry),favoriteBerryMultiplier:favorites.multiplier};
}
export function describeFavorites(configuration,catalog){
  if(configuration===null)return 'Using each Pokémon’s saved favorite berry settings.';
  const names=new Map(berryOptions(catalog).map(b=>[b.value,b.name]));
  const island=FAVORITE_ISLANDS.find(p=>p.value===configuration.island);
  const prefix=island&&island.value!=='custom'?`${island.label} · `:'';
  return configuration.berries.length
    ?`${prefix}Favorite berries: ${configuration.berries.map(b=>names.get(b)).join(', ')} · ${configuration.multiplier}× berry strength.`
    :`${prefix}No favorite berries selected. All berries use ordinary strength.`;
}
