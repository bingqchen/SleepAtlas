// Follow explicit evolution links; shared names or Pokédex numbers do not
// imply that regional, size, or event forms can evolve into each other.
export function speciesChoices(catalog,savedSpecies){
  let choices=catalog.species;
  if(savedSpecies!==undefined){
    const links=new Map(choices.map(p=>[p.name,new Set()]));
    for(const p of choices)for(const name of [p.evolvesFrom,...(p.evolvesInto||[])]){
      if(links.has(name)){links.get(p.name).add(name);links.get(name).add(p.name)}
    }
    const family=new Set(),pending=links.has(savedSpecies)?[savedSpecies]:[];
    while(pending.length){const name=pending.pop();if(family.has(name))continue;family.add(name);pending.push(...links.get(name))}
    choices=choices.filter(p=>family.has(p.name));
  }
  return [...choices].sort((a,b)=>a.displayName.localeCompare(b.displayName));
}
