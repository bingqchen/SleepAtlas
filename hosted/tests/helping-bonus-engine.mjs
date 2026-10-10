import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Engine,MODEL_VERSION,berryValueAtLevel} from '../dist/engine.js';
import {createLevelPreview} from '../dist/level-preview.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),engine=new Engine(catalog);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const raw={species:'MUSHARNA',nature:'Naughty',level:70,skillLevel:3,carrySize:29,subskills:['Berry Finding S','Skill Level Up S','Skill Trigger S','Helping Speed S','Skill Trigger M'],ingredients:['Milk','Milk','Milk']};
const teammate=engine.validate(raw),owner=engine.validate({...raw,subskills:['Berry Finding S','Helping Bonus','Skill Trigger S','Helping Speed S','Skill Trigger M']});
const member=(build=teammate,id='teammate')=>({id,name:build.nickname,build});
const team=[member()],context={helpingBonusTeam:team},snapshot=JSON.stringify({owner,team});
const solo=engine.calculate(owner),supported=engine.calculate(owner,70,context);
assert.equal(MODEL_VERSION,'atlas-1.11-web');
close(solo.strength,40313.3009247895);
close(supported.helpingBonusStrength,2298.3338168705377);
close(supported.ownStrength,solo.strength);
close(supported.strength,solo.strength+supported.helpingBonusStrength);
assert.deepEqual(supported.helpingBonusTeam,[{id:'teammate',name:teammate.nickname,strengthWithout:38014.967107918965,strengthWith:40313.3009247895,strengthDelta:supported.helpingBonusStrength}]);
for(const key of Object.keys(solo))if(!['strength','helpingBonusStrength','helpingBonusTeam'].includes(key))assert.deepEqual(supported[key],solo[key],`${key} must remain the owner's production`);
assert.equal(solo.helpingBonusTeam,null);
assert.deepEqual(engine.calculate(owner,70,{helpingBonusTeam:[]}).helpingBonusTeam,[]);
assert.equal(engine.calculate(teammate,70,context).helpingBonusStrength,0,'A non-holder earns no support credit');
assert.deepEqual(engine.calculate(teammate,70,context).helpingBonusTeam,[]);
const locked={...owner,subskills:['Berry Finding S','Skill Level Up S','Skill Trigger S','Helping Speed S','Helping Bonus']};
assert.equal(engine.calculate(locked,70,context).helpingBonusStrength,0);
close(engine.calculate(locked,80,context).helpingBonusStrength,supported.helpingBonusStrength);

// A full inventory blocks additional ingredients and banked skills, but extra
// helps still become sneaky-snacking berries. Do not multiply total output.
const saturated={...teammate,carrySize:1},satWithout=engine.calculate(saturated),satWith=engine.calculate({...saturated,settings:{...saturated.settings,teamHelpingBonus:1}});
close(satWith.ingredientCount,satWithout.ingredientCount);
close(satWith.skillTriggers,satWithout.skillTriggers);
const extraHelps=24*3600*saturated.settings.energyMultiplier*(1/satWith.frequencySeconds-1/satWithout.frequencySeconds);
const expectedSneakyGain=extraHelps*3*berryValueAtLevel(engine.species.get('MUSHARNA').berry,70);
close(engine.calculate(owner,70,{helpingBonusTeam:[member(saturated)]}).helpingBonusStrength,expectedSneakyGain);
assert.ok(Math.abs(expectedSneakyGain-satWithout.strength*.05)>.01);

// Speed caps apply per recipient; a recorded four other sources cannot become
// five. Partial capping shortens this recipient's interval from 1498 to 1412 s.
const fast={...teammate,subskills:['Berry Finding S','Helping Speed M','Skill Trigger S','Helping Speed S','Skill Trigger M']};
const otherHB=(build,count)=>({...build,settings:{...build.settings,teamHelpingBonus:count}});
const partial=engine.calculate(owner,70,{helpingBonusTeam:[member(otherHB(fast,2))]});
close(partial.helpingBonusStrength,3309.410243989165);
assert.equal(engine.calculate(otherHB(fast,2)).frequencySeconds,1498);
assert.equal(engine.calculate(otherHB(fast,3)).frequencySeconds,1412);
assert.equal(engine.calculate(owner,70,{helpingBonusTeam:[member(otherHB(fast,3))]}).helpingBonusStrength,0);
assert.equal(engine.calculate(owner,70,{helpingBonusTeam:[member(otherHB(teammate,4))]}).helpingBonusStrength,0);
const triple=engine.calculate(owner,70,{helpingBonusTeam:[member(teammate,'a'),member(saturated,'b'),member(otherHB(fast,3),'c')]});
close(triple.helpingBonusStrength,supported.helpingBonusStrength+expectedSneakyGain);

// Each teammate retains its own selected berry-skill recipients, island skill
// level bonus and trigger multiplier. Nested support credit is never included.
const sceptile=engine.validate({species:'SCEPTILE',level:60,nature:'Hardy',skillLevel:4,carrySize:40,subskills:['Helping Bonus','Skill Trigger M','Helping Speed M','',''],ingredients:[0,30,60].map(level=>engine.species.get('SCEPTILE')[`ingredient${level}`][0].ingredient.name)});
const skillContext={mainSkillLevelBonus:1,skillTriggerMultiplier:1.25,berryTeam:[{species:'MUSHARNA',level:70,favoriteMultiplier:2.4}]};
const berryMember={...member(sceptile),...skillContext,helpingBonusTeam:team};
const withSkillContext=engine.calculate(owner,70,{helpingBonusTeam:[berryMember]});
close(withSkillContext.helpingBonusTeam[0].strengthWithout,engine.calculate(sceptile,60,skillContext).strength);
close(withSkillContext.helpingBonusTeam[0].strengthWith,engine.calculate(otherHB(sceptile,1),60,skillContext).strength);
close(withSkillContext.helpingBonusStrength,engine.calculate(otherHB(sceptile,1),60,skillContext).strength-engine.calculate(sceptile,60,skillContext).strength);
assert.notEqual(withSkillContext.helpingBonusStrength,engine.calculate(owner,70,{helpingBonusTeam:[member(sceptile)]}).helpingBonusStrength);

// Independently score the reference population from unsupported personal
// output, adding the same fixed team delta only to candidates with active HB.
const inventory=b=>b.subskills.reduce((sum,s,i)=>sum+(s&&[10,25,50,70,80][i]<=b.level&&s.startsWith('Inventory Up')?catalog.subskills.find(x=>x.name===s).amount:0),0);
const percentile=(value,values)=>{const rank=100*values.reduce((sum,x)=>sum+(x<value-1e-7?1:Math.abs(x-value)<=1e-7?.5:0),0)/values.length,n=Math.floor(rank);return Math.abs(rank-n-.5)<1e-10?n+n%2:Math.round(rank)};
for(const build of [owner,teammate]){
 const rated=engine.analyze(build,context),plain=engine.analyze(build);
 const references=catalog.referenceBuilds.map(sample=>{const b={...build,...sample};b.carrySize=build.carrySize-inventory(build)+inventory(b);const own=engine.calculate(b);return own.strength+(own.activeSubskills.includes('Helping Bonus')?supported.helpingBonusStrength:0)});
 assert.equal(rated.current.ratings.strength,percentile(rated.current.strength,references));
 for(const key of ['skillTriggers','ingredientCount','berryCount'])assert.equal(rated.current.ratings[key],plain.current.ratings[key]);
 assert.ok(!Object.hasOwn(rated.build,'helpingBonusTeam'));
}
// Full reference analysis reads/prepares each teammate once, rather than once
// per synthetic reference, and does not store any support context in the build.
let reads=0;
const counted={id:'counted',name:teammate.nickname,get build(){reads++;return teammate}};
engine.analyze(owner,{helpingBonusTeam:[counted]});assert.equal(reads,1);
const startsLocked={...owner,level:60,subskills:['Berry Finding S','Skill Level Up S','Skill Trigger S','Helping Bonus','Skill Trigger M']};
const forecasts=engine.analyze(startsLocked,context);
assert.equal(forecasts.current.helpingBonusStrength,0);
for(const forecast of forecasts.forecasts){close(forecast.helpingBonusStrength,supported.helpingBonusStrength);assert.deepEqual(forecast.helpingBonusTeam,supported.helpingBonusTeam,'Teammates stay at their selected preview levels')}

// Context alone must bypass the unchanged-level fast path. The entire team
// build/context participates in cache invalidation, including live edits.
const preview=createLevelPreview(catalog),saved=engine.analyze({...owner,level:28}),savedSnapshot=JSON.stringify(saved);
const first=preview(saved,null,{full:true,...context});
assert.notEqual(first,saved);
assert.equal(first,preview(saved,null,{full:true,...context}));
close(first.current.helpingBonusStrength,supported.helpingBonusStrength);
assert.deepEqual(preview(saved,null,{helpingBonusTeam:[]}).current.helpingBonusTeam,[]);
const liveTeam=[member({...teammate,level:60})],older=preview(saved,70,{full:true,helpingBonusTeam:liveTeam});
liveTeam[0].build.level=70;
const newer=preview(saved,70,{full:true,helpingBonusTeam:liveTeam});
assert.notEqual(older.current.helpingBonusStrength,newer.current.helpingBonusStrength);
close(newer.current.helpingBonusStrength,supported.helpingBonusStrength);
assert.equal(JSON.stringify(saved),savedSnapshot);
assert.equal(JSON.stringify({owner,team}),snapshot);
for(const bad of [{},[null],Array.from({length:4},(_,i)=>member(teammate,String(i))),[member(),member()],[{...member(),build:{...teammate,level:0}}]])assert.throws(()=>engine.calculate(owner,70,{helpingBonusTeam:bad}));
console.log('Passed: Helping Bonus marginal output, unchanged personal metrics/RP, inventory saturation, partial/full caps, locked skills, teammate contexts, reference parity, fixed forecasts, single preparation, preview cache invalidation and immutable builds.');
