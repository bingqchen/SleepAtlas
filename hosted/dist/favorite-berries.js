export const FAVORITE_MULTIPLIERS=[2,2.4];
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
  return {berries:[...value.berries],multiplier:value.multiplier};
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
  return configuration.berries.length
    ?`Favorite berries: ${configuration.berries.map(b=>names.get(b)).join(', ')} · ${configuration.multiplier}× berry strength.`
    :'No favorite berries selected. All berries use ordinary strength.';
}
