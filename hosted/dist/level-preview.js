import {Engine} from './engine.js';
import {calculatedStats,updatedCarrySize} from './pokemon-stats.js';

export const TEMPORARY_LEVELS=[25,30,50,60,70,80];
// Only derived views live here. Neither the saved analysis nor its build is
// modified, and this cache is discarded when the page reloads.
export function createLevelPreview(catalog){
  const engine=new Engine(catalog),cache=new Map();
  return (analysis,level,{full=false}={})=>{
    if(level===null)return analysis;
    if(!TEMPORARY_LEVELS.includes(level))throw Error('Choose a supported temporary level.');
    if(level===analysis.build.level)return analysis;
    const key=JSON.stringify([analysis.modelVersion,analysis.catalogCommit,analysis.build,level]);
    let entry=cache.get(key);
    if(!entry){
      const saved=analysis.build,build={...saved,level};
      build.carrySize=updatedCarrySize(catalog,build,saved);
      build.displayedFrequencySeconds=calculatedStats(catalog,build).frequencySeconds;
      build.frequencySource='calculated';
      entry={build:engine.validate(build)};cache.set(key,entry);
      if(cache.size>500)cache.delete(cache.keys().next().value);
    }
    // Lists only need output totals. Calculate the reference population when
    // opening details or sorting by rating, then reuse it across filter changes.
    if(full)return entry.full??=engine.analyze(entry.build);
    return entry.full??(entry.summary??={build:entry.build,current:engine.calculate(entry.build)});
  };
}
