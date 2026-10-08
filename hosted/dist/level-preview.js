import {Engine} from './engine.js';
import {calculatedStats,updatedCarrySize} from './pokemon-stats.js';
import {favoriteSettings,favoriteSkillLevelBonus,favoriteSkillTriggerMultiplier} from './favorite-berries.js';

export const TEMPORARY_LEVELS=[25,30,50,60,70,80];
// Only derived views live here. Neither the saved analysis nor its build is
// modified, and this cache is discarded when the page reloads.
export function createLevelPreview(catalog){
  const engine=new Engine(catalog),cache=new Map();
  return (analysis,level,{full=false,favoriteBerries=null,berryTeam=null}={})=>{
    if(level!==null&&!TEMPORARY_LEVELS.includes(level))throw Error('Choose a supported temporary level.');
    const changedLevel=level!==null&&level!==analysis.build.level;
    if(!changedLevel&&favoriteBerries===null&&berryTeam===null)return analysis;
    const key=JSON.stringify([analysis.modelVersion,analysis.catalogCommit,analysis.build,level,favoriteBerries,berryTeam]);
    let entry=cache.get(key);
    if(!entry){
      const saved=analysis.build,build={...saved,level:level??saved.level};
      build.settings=favoriteSettings(build,catalog,favoriteBerries);
      if(changedLevel){
        build.carrySize=updatedCarrySize(catalog,build,saved);
        build.displayedFrequencySeconds=calculatedStats(catalog,build).frequencySeconds;
        build.frequencySource='calculated';
      }
      if((build.settings.helpingFrequencyFactor??1)!==1){
        build.displayedFrequencySeconds=calculatedStats(catalog,build).frequencySeconds;
        build.frequencySource='calculated';
      }
      entry={build:engine.validate(build)};cache.set(key,entry);
      if(cache.size>500)cache.delete(cache.keys().next().value);
    }
    // Lists only need output totals. Calculate the reference population when
    // opening details or sorting by rating, then reuse it across filter changes.
    const context={berryTeam,mainSkillLevelBonus:favoriteSkillLevelBonus(entry.build,catalog,favoriteBerries),skillTriggerMultiplier:favoriteSkillTriggerMultiplier(entry.build,catalog,favoriteBerries)};
    if(full)return entry.full??=engine.analyze(entry.build,context);
    return entry.full??(entry.summary??={build:entry.build,current:engine.calculate(entry.build,entry.build.level,context)});
  };
}
