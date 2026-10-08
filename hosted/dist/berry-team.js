import {favoriteSettings} from './favorite-berries.js';
import {favoriteMultiplier} from './engine.js';

export function validateBerryTeamIds(ids,ownerId){
  if(!Array.isArray(ids)||ids.length>4||ids.some(id=>typeof id!=='string'||!id||id===ownerId)||new Set(ids).size!==ids.length)throw Error('Choose up to four different teammates, excluding this Pokémon.');
  return [...ids];
}
// Resolve current records each time: edits, evolutions, island settings, and
// temporary levels must never leave stale teammate strengths in the view cache.
export function resolveBerryTeam(ids,ownerId,records,catalog,level=null,favorites=null){
  if(ids===undefined||ids===null)return {berryTeam:null,missing:0};
  const selected=validateBerryTeamIds(ids,ownerId),byId=new Map(records.map(row=>[row.id,row]));
  const found=selected.map(id=>byId.get(id)).filter(Boolean);
  return {missing:selected.length-found.length,berryTeam:found.map(row=>{
    const build=row.analysis.build;
    return {species:build.species,level:level??build.level,favoriteMultiplier:favoriteMultiplier(favoriteSettings(build,catalog,favorites))};
  })};
}
