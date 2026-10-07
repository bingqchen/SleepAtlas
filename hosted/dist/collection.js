const normalized=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase();
export const specialtyLabels={berry:'Berry',ingredient:'Ingredient',skill:'Skill',all:'All-rounder'};
export function specialtyCounts(current,specialty){
  const counts={skill:{label:'skill triggers',value:current.skillTriggers,digits:2},ingredient:{label:'ingredients',value:current.ingredientCount,digits:1},berry:{label:'berries',value:current.berryCount,digits:1}};
  if(current.berrySkill)return [counts.berry];
  return specialty==='all'?Object.values(counts):counts[specialty]?[counts[specialty]]:[];
}
export function collectionRows(records,species,{prefix='',specialty='',sort='strength'}={}){
  const query=normalized(prefix),catalog=new Map(species.map(p=>[p.name,p]));
  const rows=records.filter(row=>{
    const build=row.analysis.build,p=catalog.get(build.species);
    return (!specialty||p?.specialty===specialty)&&(!query||[build.nickname,p?.displayName].some(name=>normalized(name).startsWith(query)));
  });
  if(sort==='strength')rows.sort((a,b)=>b.analysis.current.strength-a.analysis.current.strength);
  else if(sort==='speed'){
    const seconds=row=>{const value=row.analysis.build.displayedFrequencySeconds;return Number.isInteger(value)&&value>0?value:Infinity};
    rows.sort((a,b)=>seconds(a)-seconds(b));
  }
  else if(sort==='level')rows.sort((a,b)=>b.analysis.build.level-a.analysis.build.level);
  else if(sort==='name')rows.sort((a,b)=>(a.analysis.build.nickname||catalog.get(a.analysis.build.species)?.displayName||'').localeCompare(b.analysis.build.nickname||catalog.get(b.analysis.build.species)?.displayName||''));
  else if(sort==='rating')rows.sort((a,b)=>b.analysis.current.ratings.strength-a.analysis.current.ratings.strength);
  return rows;
}
