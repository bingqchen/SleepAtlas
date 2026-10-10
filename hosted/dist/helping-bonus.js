// Choose from baseline collection output, before any Helping Bonus support is
// credited. Never use the visual sort order or let estimates amplify each other.
export function automaticHelpingBonusTeam(rows,ownerId,contextFor=()=>({})){
  const strength=row=>row.analysis.current.ownStrength??row.analysis.current.strength;
  return rows.filter(row=>row.id!==ownerId&&Number.isFinite(strength(row)))
    .sort((a,b)=>strength(b)-strength(a)||String(a.id).localeCompare(String(b.id)))
    .slice(0,3).map(row=>({id:row.id,name:row.analysis.build.nickname||row.analysis.build.species,
      build:row.analysis.build,...contextFor(row)}));
}
