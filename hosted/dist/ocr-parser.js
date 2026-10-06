const UNLOCKS=[10,25,50,70,80];
const normalize=s=>String(s).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const has=(text,name)=>` ${normalize(text)} `.includes(` ${normalize(name)} `);
const levelOf=line=>{const m=line.text.match(/\b(?:Lv\.?|Level)\s*(\d{1,3})\b/i);return m?Number(m[1]):null};
// Tiny green header text can lose its L. Accept v.52 only at the portrait's
// level position; never apply this fallback to ingredient/subskill markers.
const headerLevelOf=line=>levelOf(line)||(line.x>.15&&line.x<.4&&line.y<.3?Number(line.text.match(/\bv\.\s*(\d{1,3})\b/i)?.[1])||null:null);
const cy=line=>line.y+(line.h||0)/2;
const sameRow=(a,b)=>Math.abs(cy(a)-cy(b))<Math.max(.018,((a.h||0)+(b.h||0))/2);
const HOUR_UNITS='(?:hours?|hrs?|h)',MINUTE_UNITS='(?:minutes?|mins?|m)',SECOND_UNITS='(?:seconds?|secs?|s)';
const FREQUENCY_START=new RegExp(`\\bevery\\s+\\d+\\s*(?:${HOUR_UNITS}|${MINUTE_UNITS}|${SECOND_UNITS})\\b`,'i');
// Use the same duration vocabulary to locate the stats panel and read its value.
export const isFrequencyLine=line=>FREQUENCY_START.test(line.text);
// Require seconds so a partly read duration cannot silently become xx:00.
export function readDisplayedFrequency(images){
  const values=new Set();
  const duration=new RegExp(`\\bevery\\s+(?:(\\d{1,2})\\s*${HOUR_UNITS}\\s*)?(?:(\\d{1,4})\\s*${MINUTE_UNITS}\\s*)?(\\d{1,2})\\s*${SECOND_UNITS}\\b`,'gi');
  for(const image of images){
    const lines=image.lines||[],candidates=lines.map(l=>l.text);
    for(const anchor of lines.filter(l=>/\bevery\b/i.test(l.text))){
      const parts=lines.filter(l=>Number.isFinite(l.x)&&Number.isFinite(l.y)&&sameRow(anchor,l)&&l.x>=anchor.x-.01).sort((a,b)=>a.x-b.x);
      candidates.push(parts.filter((l,i)=>!parts.slice(0,i).some(p=>normalize(p.text)===normalize(l.text)&&Math.abs(p.x-l.x)<.04)).map(l=>l.text).join(' '));
    }
    for(const text of candidates)for(const match of String(text).matchAll(duration)){
      const hours=Number(match[1]||0),minutes=Number(match[2]||0),seconds=Number(match[3]),total=hours*3600+minutes*60+seconds;
      if(seconds<60&&(!match[1]||minutes<60)&&total>=1&&total<=86400)values.add(total);
    }
  }
  return {seconds:values.size===1?[...values][0]:null,conflict:values.size>1};
}
const dedupe=hits=>hits.filter((h,i)=>!hits.slice(0,i).some(p=>p.name===h.name&&Math.abs(p.line.x-h.line.x)<.15&&Math.abs(cy(p.line)-cy(h.line))<.025));
function nameBox(line,name){
  const tokens=(line.words||[]).flatMap(word=>normalize(word.text).split(' ').filter(Boolean).map(text=>({text,word})));
  const wanted=normalize(name).split(' ');
  const start=tokens.findIndex((_,i)=>wanted.every((text,j)=>tokens[i+j]?.text===text));
  if(start<0)return null;
  const words=tokens.slice(start,start+wanted.length).map(t=>t.word);
  if(words.some(w=>![w.x,w.y,w.w,w.h].every(Number.isFinite)||w.w<=0||w.h<=0))return null;
  const x=Math.min(...words.map(w=>w.x)),y=Math.min(...words.map(w=>w.y));
  return {...line,text:name,x,y,w:Math.max(...words.map(w=>w.x+w.w))-x,h:Math.max(...words.map(w=>w.y+w.h))-y};
}
function subskillHits(lines,catalog){
  return dedupe(lines.flatMap(line=>{
    const names=catalog.subskills.filter(s=>has(line.text,s.name));
    // OCR sometimes merges both cards (and their borders) into one line.
    // Use each name's words so the right card keeps its own grid position.
    // Legacy lines without word boxes are safe only when they name one skill.
    return names.flatMap(({name})=>{const box=nameBox(line,name)||(names.length===1?line:null);return box?[{name,line:box}]:[]});
  }));
}
export function subskillGrid(image,catalog){
  const hits=subskillHits(image.lines,catalog);
  if(hits.length<4||hits.length>5)return null;
  const rows=[];for(const hit of [...hits].sort((a,b)=>cy(a.line)-cy(b.line))){const row=rows.find(r=>Math.abs(cy(r[0].line)-cy(hit.line))<.03);if(row)row.push(hit);else rows.push([hit])}
  if(rows.length!==3||rows[2].length!==1||rows[2][0].line.x>=.5||rows.slice(0,2).some(r=>r.length>2||new Set(r.map(h=>h.line.x>=.5)).size!==r.length))return null;
  const centers=rows.map(r=>r.reduce((n,h)=>n+cy(h.line),0)/r.length),d1=centers[1]-centers[0],d2=centers[2]-centers[1];
  if(d1<.025||d1>.16||d2/d1<.65||d2/d1>1.5)return null;
  const cells=UNLOCKS.map((level,i)=>({level,slot:i,x:i%2?.53:.075,y:centers[Math.floor(i/2)]-.014,w:.40,h:.028,hit:rows[Math.floor(i/2)].find(h=>(h.line.x>=.5)===(i%2===1))}));
  return cells;
}
export function parseOCR(images,catalog){
  const lines=images.flatMap(i=>i.lines),text=lines.map(l=>l.text).join('\n'),fields={},warnings=[],detected=new Set();
  // A header may be one line ("Lv.31 Mewtwo"). Use whole-name boundaries so
  // Mew never matches Mewtwo, and prefer the longest matching form name.
  const p=[...catalog.species].sort((a,b)=>b.displayName.length-a.displayName.length).find(p=>lines.some(l=>l.y<.45&&has(l.text,p.displayName)));
  if(p)fields.species=p.name;
  const natures=catalog.natures.filter(n=>lines.some(l=>has(l.text,n.name)));
  if(natures.length===1)fields.nature=natures[0].name;
  const subskills=['','','','',''];let gridInferred=false;
  for(const image of images){
    const ls=image.lines;
    // Prioritize the level on the species header; an ingredient's Lv.60 may
    // appear higher on a scrolled screenshot and must not become Pokémon level.
    const headers=ls.filter(l=>l.y<.4&&p&&has(l.text,p.displayName));
    const headerLevel=headers.map(levelOf).find(l=>l>=1&&l<=100);
    const nearby=ls.filter(l=>l.x<.6&&l.y<.4&&headers.some(h=>sameRow(h,l))).map(levelOf).find(l=>l>=1&&l<=100);
    const generic=ls.filter(l=>l.x<.5&&l.y<.3&&!/^\W*Lv\.?\s*(10|25|50|70|80)\W*$/i.test(l.text)).map(headerLevelOf).find(l=>l>=1&&l<=100);
    if(fields.level===undefined&&(headerLevel||nearby||generic))fields.level=headerLevel||nearby||generic;
    {
      const labels=p?[p.skillLabel,p.skill.name]:[...new Set(catalog.species.map(s=>s.skillLabel))];
      const anchors=ls.filter(l=>labels.some(n=>n&&has(l.text,n)));
      for(const anchor of anchors){
        const inline=levelOf(anchor);const nearby=ls.filter(l=>sameRow(l,anchor)||Math.abs(cy(l)-cy(anchor))<.035).map(l=>({level:levelOf(l),distance:Math.abs(cy(l)-cy(anchor))})).filter(x=>x.level>=1&&x.level<=(p?.skill.RP?.length||7)).sort((a,b)=>a.distance-b.distance);
        const level=inline||nearby[0]?.level;if(level>=1&&level<=(p?.skill.RP?.length||7))fields.skillLevel=level;
      }
    }
    const carryInline=ls.map(l=>l.text.match(/carry\s*(?:limit|size)\W*(\d{1,3})\b/i)).find(Boolean);
    if(carryInline)fields.carrySize=Number(carryInline[1]);
    else{
      const labels=ls.filter(l=>/carry\s*(?:limit|size)/i.test(l.text));
      let values=ls.filter(l=>/^\s*\d{1,3}\s*$/.test(l.text)&&labels.some(a=>l.x>a.x&&sameRow(a,l)));
      // Colored label pills can disappear during segmentation. The carry value
      // is the lone right-column number between Frequency and Main Skill.
      if(!values.length){const frequency=ls.find(isFrequencyLine),end=ls.find(l=>/main\s+skill.*sub\s*skills/i.test(l.text));
        if(frequency&&end&&end.y>frequency.y)values=ls.filter(l=>/^\s*\d{1,3}\s*$/.test(l.text)&&l.x>.38&&l.y>frequency.y+.02&&l.y<end.y);
      }
      const numbers=[...new Set(values.map(l=>Number(l.text.trim())).filter(n=>n>=1&&n<=200))];if(numbers.length===1)fields.carrySize=numbers[0];
    }
    const hits=subskillHits(ls,catalog);
    for(const line of ls)for(const skill of catalog.subskills)if(has(line.text,skill.name))detected.add(skill.name);
    for(const hit of hits){
      const labels=ls.map(line=>({line,level:levelOf(line)})).filter(({line,level})=>[10,25,50,70,80,75,100].includes(level)&&hit.line.y-line.y>=-.008&&hit.line.y-line.y<.065&&Math.abs(hit.line.x-line.x)<.22&&((hit.line.x>=.5)===(line.x>=.5))).sort((a,b)=>Math.abs(hit.line.y-a.line.y)-Math.abs(hit.line.y-b.line.y));
      if(labels.length){const level=labels[0].level;subskills[UNLOCKS.indexOf(level===75?70:level===100?80:level)]=hit.name}
    }
    // A complete geometric grid with one unread cell still locates the other
    // four. Never shift known skills into the missing cell.
    const grid=subskillGrid(image,catalog);
    if(grid&&grid.every(c=>!c.hit||!subskills[c.slot]||subskills[c.slot]===c.hit.name)){for(const c of grid)if(c.hit)subskills[c.slot]=c.hit.name;gridInferred=true}
  }
  fields.subskills=subskills;
  const frequency=readDisplayedFrequency(images);
  if(frequency.seconds!==null)fields.displayedFrequencySeconds=frequency.seconds;
  if(frequency.conflict)warnings.push('The screenshots show different helping frequencies. Enter the current frequency manually.');
  if(gridInferred)warnings.push('Subskill slots were read from their grid positions. Confirm the order before saving.');
  warnings.push('Check all extracted details before saving.','Confirm ingredient matches; obscured or uncertain slots need manual selection.','Confirm the displayed main skill level and carry limit.');
  return {fields,detectedSubskills:[...detected],text,confidence:lines.length?lines.reduce((s,l)=>s+l.confidence,0)/lines.length:0,warnings};
}
