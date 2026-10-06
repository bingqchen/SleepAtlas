import {formatFrequency,subskillSlots} from './pokemon-stats.js';
import {api} from './local-api.js';
import {readScreenshots} from './ocr.js';
import {resolveIngredients} from './ingredient-matcher.js';
import {collectionRows,specialtyCounts,specialtyLabels} from './collection.js';
import {speciesChoices} from './evolution.js';
'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, digits=1) => Number(n).toLocaleString(undefined,{maximumFractionDigits:digits});
let catalog, records=[], editing=null, imageIds=[], pictureURLs=[], ocrText='', demo=false, online=true, saving=false, uploading=false;
let editorBaseline='',pendingEntry=false,closingEditor=false,ownsDraft=false;
// The collection lives in IndexedDB on this device; this cache also holds form drafts.
const unlocks=[10,25,50,70,80];
const species = name => catalog.species.find(p=>p.name===name);
const cacheDB=new Promise((resolve,reject)=>{const r=indexedDB.open('sleep-atlas-mobile',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function cacheGet(key){try{const db=await cacheDB;return await new Promise((res,rej)=>{const r=db.transaction('cache').objectStore('cache').get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}catch{return null}}
async function cachePut(key,value){try{const db=await cacheDB;await new Promise((res,rej)=>{const t=db.transaction('cache','readwrite');t.objectStore('cache').put(value,key);t.oncomplete=res;t.onerror=()=>rej(t.error)})}catch{/* Private browser mode can disable the optional read-only cache. */}}
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',5000)}
function connection(connected){online=connected}
async function boot(){
  try{const [c,r]=await Promise.all([api('/api/catalog'),api('/api/pokemon')]);catalog=c;records=r;connection(true);await Promise.all([cachePut('catalog',c),cachePut('records',r)])}
  catch(error){
    if(error.status===401)window.dispatchEvent(new Event('atlas:auth-required'));
    catalog=await cacheGet('catalog');records=await cacheGet('records')||[];connection(false);
    if(!catalog){$('collection').innerHTML=`<div class="empty-state"><h3>Open your research notebook</h3><p>${escapeHTML(error.message)} Check your internet connection and device storage, then reload.</p><button class="secondary" id="retry">Try again</button></div>`;$('retry').onclick=boot;return}
    toast('Showing a cached collection. Resolve the storage error before saving.');
  }
  renderCollection();renderMethod();
  if(!catalog.ocrAvailable)$('upload-status').textContent='Screenshot reading is unavailable. You can enter details manually.';
  const draft=await cacheGet('draft');
  if(draft && !$('editor').open){$('upload-status').innerHTML='You have an unfinished review. <button class="text-button" id="resume-draft">Resume draft</button>';$('resume-draft').onclick=()=>openEditor(draft.build,{id:draft.id,imageIds:draft.imageIds||[],resumed:true})}
}
async function refresh(){records=await api('/api/pokemon');connection(true);await cachePut('records',records);renderCollection()}
function renderCollection(){
  $('count').textContent=records.length;
  const visible=collectionRows(records,catalog.species,{prefix:$('search').value,specialty:$('type-filter').value,sort:$('sort').value});
  $('collection-summary').textContent=`Showing ${visible.length} of ${records.length} helpers · Estimated daily totals. Select a row for details.`;
  const empty=`<tr><td colspan="4"><div class="empty-state"><span class="empty-mark">☾</span><h3>${records.length?'No helpers match these filters.':'A new chapter for your Pokémon.'}</h3><p>${records.length?'Try a different name prefix or Pokémon type.':'Save your first helper to compare daily production.'}</p>${records.length?'<button class="text-button" id="clear-filters">Clear filters</button>':'<button class="text-button" id="sample-button">Explore an example</button>'}</div></td></tr>`;
  const rows=visible.map(row=>{
    const {build:b,current:c}=row.analysis,p=species(b.species),name=b.nickname||p.displayName;
    const subtitle=[name!==p.displayName?p.displayName:'',specialtyLabels[p.specialty]].filter(Boolean).join(' · ');
    return `<tr data-id="${escapeHTML(row.id)}"><th scope="row"><button class="helper-name" aria-label="View ${escapeHTML(name)} analysis">${escapeHTML(name)}</button><span class="helper-meta">${escapeHTML(subtitle)}</span></th><td class="num helper-level">${b.level}</td><td class="num"><strong class="summary-value">${fmt(c.strength,0)}</strong></td><td class="num">${specialtyCounts(c,p.specialty).map(metric=>`<span class="specialty-count"><strong class="summary-value">${fmt(metric.value,metric.digits)}</strong><span class="helper-meta">${metric.label}</span></span>`).join('')||'—'}</td></tr>`;
  }).join('');
  $('collection').innerHTML=`<div class="table-wrap summary-table-wrap"><table class="summary-table"><caption class="visually-hidden">Pokémon collection summary. Strength and specialty counts are estimated per day.</caption><colgroup><col class="name-column"><col class="level-column"><col class="strength-column"><col class="output-column"></colgroup><thead><tr><th scope="col">Name</th><th scope="col" class="num">Level</th><th scope="col" class="num">Total strength<span class="column-unit">/ day</span></th><th scope="col" class="num">Specialty count<span class="column-unit">/ day</span></th></tr></thead><tbody>${rows||empty}</tbody></table></div>`;
  // One row handler also receives the name button’s native keyboard click.
  $('collection').querySelectorAll('tr[data-id]').forEach(row=>row.onclick=()=>showDetails(row.dataset.id));
  if($('sample-button'))$('sample-button').onclick=showExample;
  if($('clear-filters'))$('clear-filters').onclick=()=>{$('search').value='';$('type-filter').value='';renderCollection()};
}
function options(values,current,placeholder){return (placeholder?`<option value="">${escapeHTML(placeholder)}</option>`:'')+values.map(v=>{const value=typeof v==='string'?v:v.value,label=typeof v==='string'?v:v.label;return `<option value="${escapeHTML(value)}" ${value===current?'selected':''}>${escapeHTML(label)}</option>`}).join('')}
function field(label,id,value,type='text',attributes=''){return `<label class="field" for="${id}">${label}<input id="${id}" type="${type}" value="${escapeHTML(value??'')}" ${attributes}></label>`}
function getBuild(){
  return {species:$('f-species').value,nickname:$('f-nickname').value,level:Number($('f-level').value),nature:$('f-nature').value,skillLevel:Number($('f-skillLevel').value),carrySize:Number($('f-carrySize').value),displayedFrequencySeconds:$('f-frequency-minutes').value===''&&$('f-frequency-seconds').value===''?null:Number($('f-frequency-minutes').value)*60+Number($('f-frequency-seconds').value),subskills:unlocks.map(l=>$(`sub-${l}`).value),ingredients:[0,30,60].map(l=>$(`ing-${l}`).value),notes:$('f-notes').value,settings:{energyMultiplier:Number($('s-energy').value),sleepHours:Number($('s-sleep').value),collectionHours:Number($('s-collection').value),areaBonus:Number($('s-area').value),favoriteBerry:$('s-favorite').checked,teamHelpingBonus:Number($('s-team').value)}};
}
function openEditor(build={},context={}){
  if(!catalog){toast('Load the app first.');return}
  clearTimeout(saveDraft.timer);
  const saved=context.id?records.find(row=>row.id===context.id)?.analysis.build:null;
  if(context.id&&!saved){toast('This Pokémon is no longer in the collection. Reload and try again.');return}
  // Drafts may contain a changed species. Always anchor edits to the saved one.
  const choices=speciesChoices(catalog,saved?.species);
  const selectedSpecies=choices.some(p=>p.name===build.species)?build.species:'';
  $('import-dialog').close();
  editing=context.id||null;imageIds=context.imageIds||[];ocrText=context.text||'';demo=!!context.demo;
  pictureURLs.forEach(URL.revokeObjectURL);pictureURLs=(context.files||[]).map(f=>URL.createObjectURL(f));
  const settings={...catalog.defaults,...build.settings};const p=species(selectedSpecies);
  $('editor-title').textContent=editing?'Update your helper':demo?'Try an example build':'Review your helper';
  $('form-status').textContent='';$('save-button').textContent='Analyze & save';
  $('editor-body').innerHTML=`${demo?'<div class="notice info">Example only. It becomes part of your collection only if you save it.</div>':''}${context.warnings?`<div class="notice">${context.warnings.map(escapeHTML).join('<br>')}</div>`:'<div class="notice info">Use the values shown on your Pokémon’s detail screens. Required details are never guessed.</div>'}<div class="preview-strip">${pictureURLs.map((u,i)=>`<img src="${u}" alt="Screenshot ${i+1}">`).join('')}</div><div class="form-grid"><label class="field full" for="f-species">Species<select id="f-species" required>${options(choices.map(p=>({value:p.name,label:p.displayName})),selectedSpecies,'Choose species…')}</select>${editing?'<small>Choose from this Pokémon’s evolution family.</small>':''}</label>${field('Nickname (optional)','f-nickname',build.nickname,'text','maxlength="80"')}${field('Pokémon level','f-level',build.level,'number','min="1" max="100" required')}<label class="field" for="f-nature">Nature<select id="f-nature" required>${options(catalog.natures.map(n=>({value:n.name,label:n.prettyName})),build.nature,'Choose nature…')}</select></label>${field('Displayed main skill level','f-skillLevel',build.skillLevel,'number','min="1" max="7" required')}${field('Displayed carry limit','f-carrySize',build.carrySize,'number','min="1" max="200" required')}<div class="field"><span>Main skill</span><span id="skill-label" class="small">${escapeHTML(p?.skillLabel||'Choose a species')}</span><small>Use the displayed skill level and carry limit, including any bonuses.</small></div></div><h3 class="form-section">Helping frequency shown in game</h3><p class="small" id="frequency-help">Optional. Copy the frequency from this Pokémon’s stats. Leave blank if it is not visible.</p><div class="form-grid">${field('Minutes','f-frequency-minutes',build.displayedFrequencySeconds?Math.floor(build.displayedFrequencySeconds/60):'','number','min="0" max="1440" step="1" aria-describedby="frequency-help"')}${field('Seconds','f-frequency-seconds',build.displayedFrequencySeconds?build.displayedFrequencySeconds%60:'','number','min="0" max="59" step="1" aria-describedby="frequency-help"')}</div><h3 class="form-section">Ingredient slots</h3><p class="small">Confirm the icons in all three slots. Future slots are used for projections.</p><div class="form-grid" id="ingredient-fields"></div><h3 class="form-section">Subskills</h3>${context.detectedSubskills?.length?`<p class="small">Detected: ${context.detectedSubskills.map(escapeHTML).join(', ')}. Verify each unlock level.</p>`:''}<div class="subskill-grid">${unlocks.map((l,i)=>`<label class="field" for="sub-${l}">Unlocks at Lv. ${l}<select id="sub-${l}">${options(catalog.subskills.map(s=>s.name),build.subskills?.[i],'Unknown / no bonus modeled')}</select></label>`).join('')}</div><details><summary>Daily routine & analysis settings</summary><p class="small">These assumptions affect output. The 2.2× energy setting is an average scenario, not an energy simulation.</p><div class="form-grid">${field('Average energy speed multiplier','s-energy',settings.energyMultiplier,'number','min="1" max="2.5" step="0.1" required')}${field('Sleep hours (no collection)','s-sleep',settings.sleepHours,'number','min="0" max="12" step="0.5" required')}${field('Collect every (awake hours)','s-collection',settings.collectionHours,'number','min="0.25" max="12" step="0.25" required')}${field('Area bonus (%)','s-area',settings.areaBonus,'number','min="0" max="100" step="1" required')}${field('Other teammates with Helping Bonus','s-team',settings.teamHelpingBonus,'number','min="0" max="4" step="1" required')}<label class="check-row"><input id="s-favorite" type="checkbox" ${settings.favoriteBerry?'checked':''}>Snorlax’s favorite berry</label></div></details><label class="field" for="f-notes">Notes<textarea id="f-notes" rows="2" maxlength="4000" placeholder="Anything you want to remember…">${escapeHTML(build.notes||'')}</textarea></label>${ocrText?`<details><summary>Recognized screenshot text</summary><pre>${escapeHTML(ocrText)}</pre></details>`:''}<p class="small">Saving updates a matching Pokémon, including level changes and subskill upgrades. The previous analysis stays in its history.</p>`;
  renderIngredientFields(build.ingredients);$('f-skillLevel').max=p?.skill?.RP?.length||7;
  $('f-species').onchange=()=>{const selected=[0,30,60].map(l=>$(`ing-${l}`).value),p=species($('f-species').value);$('skill-label').textContent=p?.skillLabel||'Choose a species';$('f-skillLevel').max=p?.skill?.RP?.length||7;const matched=resolveIngredients(context.ingredientMatches||[],p);renderIngredientFields(editing?selected:matched.ingredients);if(matched.warnings.length)toast(matched.warnings.join(' '));saveDraft()};
  const frequencyInputs=['f-species','f-level','f-nature',...unlocks.map(l=>`sub-${l}`)];
  let frequencyStats=frequencyInputs.map(id=>$(id).value).join('|');
  const invalidateFrequency=()=>{
    const current=frequencyInputs.map(id=>$(id).value).join('|');
    if(current!==frequencyStats){$('f-frequency-minutes').value='';$('f-frequency-seconds').value='';$('frequency-help').textContent='Stats changed. Enter the current helping frequency shown in game, or leave it blank.';frequencyStats=current}
  };
  $('editor-body').onchange=()=>{invalidateFrequency();saveDraft()};
  $('editor-body').oninput=()=>{invalidateFrequency();clearTimeout(saveDraft.timer);saveDraft.timer=setTimeout(saveDraft,400)};
  editorBaseline=editorSnapshot();
  pendingEntry=!!context.resumed||(!editing&&!demo&&(imageIds.length>0||Object.keys(build).length>0));
  ownsDraft=!!context.resumed;
  if(!$('editor').open)$('editor').showModal();
  if(pendingEntry)saveDraft();
}
function renderIngredientFields(selected=[]){
  const p=species($('f-species').value);
  $('ingredient-fields').innerHTML=[0,30,60].map((l,i)=>`<label class="field" for="ing-${l}">Lv. ${l||1}<select id="ing-${l}" required ${p?'':'disabled'}>${options((p?.[`ingredient${l}`]||[]).map(x=>({value:x.ingredient.name,label:`${x.ingredient.longName} ×${x.amount}`})),selected?.[i]||(i===0?p?.ingredient0[0].ingredient.name:undefined),'Confirm ingredient…')}</select></label>`).join('');
}
function editorSnapshot(){return JSON.stringify([...$('editor-body').querySelectorAll('input,select,textarea')].map(field=>[field.id,field.type==='checkbox'?field.checked:field.value]))}
function hasUnsavedChanges(){return $('editor').open&&(pendingEntry||editorSnapshot()!==editorBaseline)}
function saveDraft(){
  if(!$('editor').open||saving||closingEditor||!$('f-species'))return;
  if(hasUnsavedChanges()){ownsDraft=true;cachePut('draft',{id:editing,build:getBuild(),imageIds})}
  else void clearEditorDraft();
}
async function clearEditorDraft(){
  clearTimeout(saveDraft.timer);
  // Opening and canceling a clean editor must not erase another recovery draft.
  if(!ownsDraft)return;
  ownsDraft=false;await cachePut('draft',null);
  if(!ownsDraft&&$('resume-draft'))$('upload-status').textContent='';
}
async function finishEditorClose(){
  if(saving||closingEditor)return;
  closingEditor=true;$('keep-editing').disabled=$('discard-editor').disabled=true;
  try{await clearEditorDraft();$('discard-changes').close();$('editor').close();editorBaseline='';pendingEntry=false}
  finally{closingEditor=false;$('keep-editing').disabled=$('discard-editor').disabled=false}
}
function requestEditorClose(){
  if(saving||closingEditor)return;
  if(hasUnsavedChanges()){if(!$('discard-changes').open)$('discard-changes').showModal()}
  else void finishEditorClose();
}
async function upload(files){
  if(uploading)return;
  if(!online){$('upload-status').textContent='Reload the app to restore access to device storage.';return}
  if(!files.length)return;
  if(files.length>8){$('upload-status').textContent='Choose up to 8 images for one Pokémon.';return}
  if(files.some(f=>f.size>12*1024*1024)){$('upload-status').textContent='Each image must be smaller than 12 MB.';return}
  setUploadBusy(true);$('upload-status').textContent=`Reading ${files.length} screenshot${files.length>1?'s':''} on this device…`;
  try{
    const result=await readScreenshots(files,message=>{$('upload-status').textContent=message});
    openEditor(result.fields,{...result,files});$('upload-status').textContent='Screenshots read. Review the details before saving.';
  }catch(error){$('upload-status').textContent=error.message;toast(error.message)}finally{setUploadBusy(false);$('screenshots').value=''}
}
$('pokemon-form').onsubmit=async event=>{
  event.preventDefault();if(saving||closingEditor)return;if(!online){$('form-status').textContent='Device storage is unavailable. Your draft is kept where possible; reload and try again.';saveDraft();return}
  clearTimeout(saveDraft.timer);const build=getBuild(),controls=[...$('pokemon-form').elements].map(field=>[field,field.disabled]);saving=true;
  for(const [field] of controls)field.disabled=true;
  $('form-status').textContent='Calculating daily output and ratings…';
  try{const row=await api('/api/pokemon',{method:'POST',body:JSON.stringify({build,id:editing,imageIds})});pendingEntry=false;editorBaseline=editorSnapshot();await clearEditorDraft();$('editor').close();await refresh();await showDetails(row.id);toast(row.deduplicated?`Updated matching Pokémon${row.deduplicated>1?` and merged ${row.deduplicated} entries`:''}. Previous analyses kept in history.`:'Analysis saved to your local collection.')}
  catch(error){$('form-status').textContent=error.message;saving=false;saveDraft()}finally{saving=false;for(const [field,disabled] of controls)field.disabled=disabled}
};
function pokemonStats(build){
  return `<section class="pokemon-own-stats" aria-label="Pokémon stats"><div class="frequency-stat"><h3>Helping frequency</h3><strong>${formatFrequency(build.displayedFrequencySeconds)}</strong><p class="small">${build.displayedFrequencySeconds?'From this Pokémon’s stats in game.':'Add the frequency from this Pokémon’s stats using Edit & recalculate.'}</p></div><h3>Subskills by level</h3><div class="table-wrap"><table class="subskill-levels"><thead><tr><th scope="col">Unlock level</th><th scope="col">Subskill</th><th scope="col">Status</th></tr></thead><tbody>${subskillSlots(build).map(slot=>`<tr><th scope="row">Lv. ${slot.level}</th><td>${escapeHTML(slot.name)}</td><td>${slot.unlocked?(slot.name==='Unknown'?'Unlocked':'Active'):'Locked'}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function ingredientTable(items){return `<div class="table-wrap"><table><thead><tr><th>Ingredient</th><th class="num">Per day</th><th class="num">Raw strength</th><th class="num">Percentile</th></tr></thead><tbody>${items.map(i=>`<tr><td>${escapeHTML(i.longName)}${!i.count?'<br><span class="small">Not produced by active slots</span>':''}</td><td class="num">${fmt(i.count,2)}</td><td class="num">${fmt(i.strength,0)}</td><td class="num">${i.rating==null?'—':`${i.rating}/100`}</td></tr>`).join('')}</tbody></table></div>`}
async function showDetails(id,example){
  try{
    const row=example|| (online?await api(`/api/pokemon/${encodeURIComponent(id)}`):records.find(p=>p.id===id));
    if(!row)throw new Error('This helper is no longer available.');
    const a=row.analysis,b=a.build,c=a.current,p=species(b.species);
    $('detail-body').innerHTML=`<div class="dialog-header"><div><span class="section-number">${example?'EXAMPLE · NOT SAVED':'SAVED ANALYSIS'} · LV. ${b.level}</span><h2>${escapeHTML(b.nickname)}</h2><span class="small">${escapeHTML(p.displayName)} · ${escapeHTML(b.nature)} · ${escapeHTML(p.specialty)} specialist</span></div><button class="icon-button" data-close="details" aria-label="Close analysis">×</button></div><div class="detail-content">${pokemonStats(b)}<h3>Estimated daily output</h3><p class="small">Expected output per 24 hours · ${escapeHTML(p.skillLabel)} Lv. ${b.skillLevel}</p><div class="metrics">${[['Skill triggers',fmt(c.skillTriggers,2),c.ratings.skillTriggers],['Raw strength',fmt(c.strength,0),c.ratings.strength],['Ingredients',fmt(c.ingredientCount),c.ratings.ingredientCount]].map(([label,n,r])=>`<div class="metric"><label>${label} / day</label><strong>${n}</strong><small>Percentile ${r} / 100</small></div>`).join('')}</div><p class="small">Ratings compare ${a.referenceCount.toLocaleString()} uniformly sampled builds of ${escapeHTML(p.displayName)} at Lv. ${b.level}, with the same ingredient slots and main skill level. They are model percentiles, not a player-population ranking.</p>${a.warnings.map(w=>`<div class="notice">${escapeHTML(w)}</div>`).join('')}<h3>Every possible ingredient</h3><p class="small">Gathered output for the selected slots. Unselected or locked ingredients show zero.</p>${ingredientTable(c.ingredients)}${c.randomIngredients?`<p class="notice info">Ingredient Magnet adds an estimated <strong>${fmt(c.randomIngredients)} random ingredients / day</strong>. These are separate from gathered counts; ingredient types depend on what you have unlocked.</p>`:''}<details open><summary>Where the strength comes from</summary><table><tbody><tr><td>${fmt(c.berryCount)} berries</td><td class="num">${fmt(c.berryStrength,0)}</td></tr><tr><td>Gathered ingredients at base value</td><td class="num">${fmt(c.ingredientStrength,0)}</td></tr><tr><td>Modeled direct skill strength</td><td class="num">${fmt(c.skillStrength,0)}</td></tr></tbody></table><p class="small">Raw strength is a comparison estimate. Recipe bonuses, critical meals, support skills, team effects, and random ingredient skill strength are excluded.</p></details>${a.forecasts.length?`<details><summary>Future levels · same build</summary><table><thead><tr><th>Level</th><th class="num">Skills / day</th><th class="num">Ingredients / day</th><th class="num">Raw strength</th></tr></thead><tbody>${a.forecasts.map(f=>`<tr><td>${f.level}</td><td class="num">${fmt(f.skillTriggers,2)}</td><td class="num">${fmt(f.ingredientCount)}</td><td class="num">${fmt(f.strength,0)}</td></tr>`).join('')}</tbody></table><p class="small">Applies future subskill and ingredient unlocks; keeps the displayed main skill level unchanged.</p></details>`:''}<details><summary>Compare all ingredient combinations at Lv. 60</summary><p class="small">Hypothetical builds of this species with your nature and subskills. Your actual ingredient slots cannot be changed in game.</p><div class="table-wrap"><table><thead><tr><th>Lv. 1 / 30 / 60</th><th>Daily ingredients</th><th class="num">Total / day</th></tr></thead><tbody>${a.ingredientAlternatives.map(v=>`<tr><td>${v.slots.map(escapeHTML).join(' / ')}</td><td>${v.ingredients.filter(i=>i.count>0).map(i=>`${escapeHTML(i.name)} ${fmt(i.count)}`).join(', ')}</td><td class="num">${fmt(v.ingredientCount)}</td></tr>`).join('')}</tbody></table></div></details><details><summary>Routine, assumptions & provenance</summary><p class="small">${b.settings.sleepHours} hours asleep · collect every ${b.settings.collectionHours} awake hours · ${b.settings.energyMultiplier}× average energy speed · ${b.settings.areaBonus}% area bonus · ${b.settings.favoriteBerry?'favorite':'ordinary'} berry · ${b.carrySize} carry limit.</p><p class="small">Modeled help frequency: ${fmt(c.frequencySeconds/60,1)} minutes. Ingredient chance: ${fmt(c.ingredientRate*100,2)}%. Skill chance: ${fmt(c.skillRate*100,2)}%. Inventory saturation and skill banking are approximations. No pity triggers, ribbons, camp, event bonuses, or energy-skill feedback.</p><p class="small">Model ${escapeHTML(a.modelVersion)} · <a href="https://github.com/nerolis-lab/nerolis-lab/tree/${a.catalogCommit}" target="_blank" rel="noopener">Neroli’s Lab catalog</a> · ${row.historyCount||1} saved analysis version(s).</p></details>${b.notes?`<p>${escapeHTML(b.notes)}</p>`:''}${row.screenshots?.length?`<details><summary>Original screenshot text (${row.screenshots.length} images)</summary>${row.screenshots.map(s=>`<p class="small">${escapeHTML(s.filename)}</p><pre>${escapeHTML(s.text.map(l=>l.text).join('\n'))}</pre>`).join('')}</details>`:''}</div><div class="dialog-footer">${example?'':'<button class="text-button danger" id="delete-pokemon">Delete</button>'}<button class="secondary" data-close="details">Close</button><button class="primary" id="edit-pokemon">${example?'Use this example':'Edit & recalculate'}</button></div>`;
    bindClose($('details'));$('edit-pokemon').onclick=()=>{$('details').close();openEditor(b,{id:example?null:row.id,imageIds:row.screenshots?.map(s=>s.id)||[],demo:!!example})};
    if($('delete-pokemon'))$('delete-pokemon').onclick=async()=>{if(!confirm(`Delete ${b.nickname} and its saved screenshots? This cannot be undone.`))return;try{await api(`/api/pokemon/${encodeURIComponent(row.id)}`,{method:'DELETE'});$('details').close();await refresh();toast('Pokémon deleted.')}catch(e){toast(e.message)}};
    if(!$('details').open)$('details').showModal();
  }catch(e){toast(e.message)}
}
async function showExample(){
  if(!catalog)return;const p=species('RAICHU');
  const build={species:p.name,nickname:'Raichu · example',level:30,nature:'Adamant',skillLevel:3,carrySize:31,subskills:['Berry Finding S','Helping Speed M','Skill Trigger M','Helping Bonus','Ingredient Finder M'],ingredients:['Apple','Ginger','Apple'],settings:catalog.defaults,notes:''};
  if(!online){openEditor(build,{demo:true});return}
  try{const a=await api('/api/analyze',{method:'POST',body:JSON.stringify({build})});await showDetails(null,{analysis:a})}catch(e){toast(e.message)}
}
function renderMethod(){
  $('method-body').innerHTML=`<p><strong>Sleep Atlas is your private research notebook.</strong> Screenshots are read on your device with Tesseract.js. Pokémon, images, analysis history, and calculated results are saved in this browser’s local database. Your screenshots are not sent to a server. Each device and browser has its own collection.</p><h3>What a rating means</h3><p>Each metric receives a percentile against 1,000 deterministic, uniformly sampled builds of the same species and level, with identical ingredient slots, routine, and displayed main skill level. Each reference has one of 25 natures and five unique subskills; only unlocked subskills apply. Inventory bonuses are adjusted between builds. A score of 90 means the metric exceeds about 90% of these synthetic builds. This is not RaenonX’s rating or a rarity-weighted population percentile. Ties share a midpoint rank.</p><h3>Daily output</h3><p>Species rates, level, nature, and active subskills determine help frequency and ingredient/skill chances. A selectable average energy-speed multiplier is held constant across the day. The model estimates inventory filling between collections, berry-only sneaky snacking, and one banked skill (two for skill specialists). It does not simulate exact help timing, energy recovery, pity triggers, ribbons, camp, event bonuses, or team skill interactions.</p><p><strong>Raw strength</strong> combines berries, gathered ingredients at base value, and supported direct Charge Strength skills, with your area bonus. Recipe bonuses, critical dishes, indirect support effects, special skill modifiers, and random ingredient skill strength are excluded. Ingredient Magnet rewards appear separately. The result is useful for comparison; it is not an exact forecast of Snorlax’s final strength.</p><h3>Reading screenshots</h3><p>English text is supported. Add several detail screens for one Pokémon at a time. The reader compares the small Pokémon picture with reference sprites, so nicknames do not prevent recognition. Similar forms or uncertain pictures may still need manual species selection. Nickname text in other languages must be entered manually. The second and third ingredient icons are compared with reference pictures, including faded locked slots. A close match fills the slot only when it is valid for that species and quantity. The first ingredient comes from the species catalog. Confirm all slots; obscured or uncertain icons need manual selection. Verify subskill unlock positions, nature, level, displayed carry limit, and main skill level before saving. Uncertain or missing fields remain editable. Screenshots with no readable text still need manual entry.</p><h3>On your phone</h3><p>Open this site in Safari, tap Share, choose Add to Home Screen, enable Open as Web App if shown, then tap Add. Your Mac does not need to be running. Launch from the same app icon each time so you use the same device collection.</p><p>After the first successful online visit, the app can reopen, calculate, and save offline. Screenshot reading needs its OCR files downloaded once; an initial internet connection is recommended. Your ChatGPT sign-in may still require an internet connection.</p><h3>Saving & matching Pokémon</h3><p>Save directly after entering the details. A new entry updates a saved Pokémon when species, nature, ingredient slots, and subskill positions match, allowing level changes and subskill upgrades within the same family. Carry limit and main skill level must match or reflect those subskill bonuses. Nicknames and daily routine settings do not prevent a match. The latest entry appears in your collection; previous analyses remain in its local history.</p><h3>Backups & data</h3><p>Export regularly: clearing browser data or removing the home-screen app can remove its collection. Browser storage is not a cloud backup. Export a JSON backup on one device, then Restore it on another. Backups from the Mac app are compatible. Restore merges missing records without overwriting existing IDs and recalculates their results. Export includes Pokémon builds and settings. Screenshot images, recognized text, and past analysis versions stay on this device and are excluded from exports. Older backups containing screenshots can still be restored.</p><h3>Sources</h3><p>${catalog.species.length} Pokémon and forms from <a href="https://github.com/nerolis-lab/nerolis-lab/tree/${catalog.commit}" target="_blank" rel="noopener">Neroli’s Lab</a>, pinned to commit ${catalog.commit.slice(0,10)} and retrieved ${catalog.retrieved}. Dataset distributed under Apache 2.0; source and license notices are included with this project. Pokémon is owned by its respective rights holders. This is an unofficial fan project.</p>`;
}
function bindClose(root=document){root.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.dataset.close==='editor'?requestEditorClose():$(b.dataset.close).close())}
bindClose();
$('editor').oncancel=event=>{event.preventDefault();requestEditorClose()};
$('keep-editing').onclick=()=>{if(!closingEditor)$('discard-changes').close()};
$('discard-editor').onclick=()=>void finishEditorClose();
$('discard-changes').oncancel=event=>{if(closingEditor)event.preventDefault()};
window.addEventListener('beforeunload',event=>{if(!saving&&!closingEditor&&hasUnsavedChanges()){saveDraft();event.preventDefault();event.returnValue=''}});
function setUploadBusy(busy){
  uploading=busy;
  ['screenshots','choose-screenshots','manual-button','resume-draft'].forEach(id=>{if($(id))$(id).disabled=busy});
  $('import-dialog').querySelector('[data-close]').disabled=busy;
}
function closeActions(restoreFocus=false){
  $('actions-panel').hidden=true;$('actions-button').setAttribute('aria-expanded','false');
  if(restoreFocus)$('actions-button').focus();
}
$('actions-button').onclick=event=>{
  if(!$('actions-panel').hidden){closeActions(true);return}
  $('actions-panel').hidden=false;$('actions-button').setAttribute('aria-expanded','true');
  if(event.detail===0)$('add-pokemon').focus();
};
document.addEventListener('pointerdown',event=>{if(!$('collection-actions').contains(event.target))closeActions()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('actions-panel').hidden){event.preventDefault();closeActions(true)}});
// Safari can blur a button to no target before its tap becomes a click.
// Close only when focus actually arrives outside, never on that transient blur.
document.addEventListener('focusin',event=>{if(event.target!==document.body&&!$('collection-actions').contains(event.target))closeActions()});
$('add-pokemon').onclick=()=>{closeActions(true);$('import-dialog').showModal()};
$('restore-button').onclick=()=>{closeActions(true);$('restore-file').click()};
$('choose-screenshots').onclick=()=>$('screenshots').click();
$('import-dialog').oncancel=event=>{if(uploading)event.preventDefault()};
$('manual-button').onclick=()=>openEditor();
$('screenshots').onchange=e=>upload([...e.target.files]);
$('dropzone').ondragover=e=>{e.preventDefault();$('dropzone').classList.add('dragging')};
$('dropzone').ondragleave=()=>$('dropzone').classList.remove('dragging');
$('dropzone').ondrop=e=>{e.preventDefault();$('dropzone').classList.remove('dragging');upload([...e.dataTransfer.files])};
$('search').oninput=renderCollection;$('sort').onchange=renderCollection;$('type-filter').onchange=renderCollection;
function openHelp(){if(!catalog){toast('Connect to load the notebook.');return}$('method').showModal()}
$('method-button').onclick=openHelp;
$('about-button').onclick=()=>{closeActions(true);openHelp()};
$('export-button').onclick=async()=>{closeActions(true);try{const data=await api('/api/backup');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`sleep-atlas-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exported.')}catch(e){toast(e.message)}};
$('restore-file').onchange=async event=>{const f=event.target.files[0];if(!f)return;try{if(f.size>140*1024*1024)throw new Error('Backup exceeds 140 MB.');const body=JSON.parse(await f.text());const result=await api('/api/restore',{method:'POST',body:JSON.stringify(body)});await refresh();toast(`Restored ${result.added} helpers; ${result.skipped} already present.`)}catch(e){toast(e.message)}finally{event.target.value=''}};
window.addEventListener('online',()=>{if(!catalog)boot()});
window.addEventListener('focus',()=>{if(catalog&&online)refresh().catch(e=>toast(e.message))});
let updateRegistration;
if('serviceWorker' in navigator && window.isSecureContext){
  let hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(hadController){
      if(!$('editor').open&&!$('screenshots').disabled&&!saving)location.reload();
      else{$('update-button').textContent='Reload update';toast('An app update is ready. Finish this review, then select Reload update.')}
    }
    hadController=true;
  });
  navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>{updateRegistration=r;r.update().catch(()=>{})}).catch(()=>{});
}
$('update-button').onclick=async()=>{
  if($('screenshots').disabled||saving){toast('Finish the current import or save, then check for updates.');return}
  saveDraft();$('update-button').disabled=true;
  try{
    if(updateRegistration){await updateRegistration.update();const worker=updateRegistration.installing||updateRegistration.waiting;if(worker&&worker.state!=='activated')await new Promise(resolve=>{const timer=setTimeout(resolve,8000);worker.addEventListener('statechange',()=>{if(['activated','redundant'].includes(worker.state)){clearTimeout(timer);resolve()}})})}
    location.reload();
  }catch{toast('Connect to the internet to check for updates.');$('update-button').disabled=false}
};
if(document.modelContext?.registerTool){
  try{Promise.resolve(document.modelContext.registerTool({name:'list_saved_pokemon',title:'Read saved Pokémon analyses',description:'Read the Pokémon collection currently loaded in Sleep Atlas. Does not change saved records.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async input=>{if(!input||Object.keys(input).length)throw new Error('Expected an empty object.');return records.map(r=>({id:r.id,name:r.analysis.build.nickname,species:r.analysis.build.species,level:r.analysis.build.level,metrics:r.analysis.current}))}})).catch(()=>{})}catch{}
}
boot();
