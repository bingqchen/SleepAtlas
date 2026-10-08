import {setupOffline} from './offline.js';
import {formatFrequency,subskillSlots,calculatedStats,updatedCarrySize} from './pokemon-stats.js';
import {api,projectAnalysis} from './local-api.js';
import {readScreenshots} from './ocr.js';
import {resolveIngredients} from './ingredient-matcher.js';
import {collectionRows,specialtyCounts,specialtyLabels} from './collection.js';
import {speciesChoices} from './evolution.js';
import {mainSkillOptions,resolveMainSkill,skillLevelOptions} from './main-skills.js';
import {detailNeighbors,attachDetailSwipes} from './detail-navigation.js';
import {createLevelPreview} from './level-preview.js';
import {FAVORITE_ISLANDS,islandFavorites,berryOptions,validateFavorites,describeFavorites} from './favorite-berries.js';
import {favoriteMultiplier,hasTeamBerryBurst} from './engine.js';
import {validateBerryTeamIds,resolveBerryTeam} from './berry-team.js';
'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, digits=1) => Number(n).toLocaleString(undefined,{maximumFractionDigits:digits});
let catalog, records=[], editing=null, imageIds=[], pictureURLs=[], ocrText='', demo=false, online=true, saving=false, uploading=false;
let editorBaseline='',pendingEntry=false,closingEditor=false,ownsDraft=false;
let editorStatAnchors=null;
let detailId=null,detailOrder=[],detailRequest=0,detailLoading=false;
let levelOverride=null,levelPreview,favoriteBerryConfig=null,editorFavoriteMultiplier,berryTeams={};
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
    records=records.map(row=>({...row,analysis:projectAnalysis(row.analysis,catalog)}));
    toast('Showing a cached collection. Resolve the storage error before saving.');
  }
  levelPreview=createLevelPreview(catalog);$('level-override').value=levelOverride??'';$('level-override').disabled=false;
  try{favoriteBerryConfig=validateFavorites(await cacheGet('favorite-berries')??null,catalog)}catch{favoriteBerryConfig=null}
  berryTeams={};const savedTeams=await cacheGet('berry-teams');
  if(savedTeams&&typeof savedTeams==='object'&&!Array.isArray(savedTeams))for(const [id,ids] of Object.entries(savedTeams)){try{berryTeams[id]=validateBerryTeamIds(ids,id)}catch{/* Ignore malformed preferences without changing saved Pokémon. */}}
  renderCollection();renderMethod();
  if(!catalog.ocrAvailable)$('upload-status').textContent='Screenshot reading is unavailable. You can enter details manually.';
  const draft=await cacheGet('draft');
  if(draft && !$('editor').open){$('upload-status').innerHTML='You have an unfinished review. <button class="text-button" id="resume-draft">Resume draft</button>';$('resume-draft').onclick=()=>openEditor(draft.build,{id:draft.id,imageIds:draft.imageIds||[],statAnchors:draft.statAnchors,resumed:true})}
}
async function refresh(){records=await api('/api/pokemon');connection(true);await cachePut('records',records);renderCollection()}
function berryTeamFor(row){
  if(!hasTeamBerryBurst(resolveMainSkill(catalog,row.analysis.build).skill))return {berryTeam:null,missing:0};
  return resolveBerryTeam(berryTeams[row.id],row.id,records,catalog,levelOverride,favoriteBerryConfig);
}
function visibleCollection(){
  const sort=$('sort').value;
  const views=records.map(row=>({...row,analysis:levelPreview(row.analysis,levelOverride,{full:sort==='rating',favoriteBerries:favoriteBerryConfig,...berryTeamFor(row)})}));
  return collectionRows(views,catalog.species,{prefix:$('search').value,specialty:$('type-filter').value,sort});
}
function setLevelOverride(value){
  if(!catalog)return;
  levelOverride=value===''?null:Number(value);$('level-override').value=value;
  renderCollection();
}
function renderCollection(){
  $('count').textContent=records.length;
  $('level-preview-notice').hidden=levelOverride===null;
  $('level-preview-description').textContent=levelOverride===null?'':`Temporary Lv. ${levelOverride} for all Pokémon. Saved levels are unchanged.`;
  $('favorite-berry-summary').hidden=favoriteBerryConfig===null;
  $('favorite-berry-summary').textContent=describeFavorites(favoriteBerryConfig,catalog);
  const visible=visibleCollection(),sort=$('sort').value;
  const lastHeading=sort==='rating'?'Rating':sort==='speed'?'Speed':sort==='rp'?'RP':'Specialty count';
  const lastUnit=sort==='rating'?'/ 100':sort==='speed'?'per help':sort==='rp'?'estimated':'/ day';
  const description=sort==='rating'?'Strength rating against builds of the same species.':sort==='speed'?'Own helping frequency · Fastest first.':sort==='rp'?'Estimated RP · Highest first.':'Estimated daily totals.';
  $('collection-summary').textContent=`Showing ${visible.length} of ${records.length} helpers · ${description} Select a row for details.`;
  const empty=`<tr><td colspan="4"><div class="empty-state"><span class="empty-mark">☾</span><h3>${records.length?'No helpers match these filters.':'A new chapter for your Pokémon.'}</h3><p>${records.length?'Try a different name prefix or Pokémon type.':'Save your first helper to compare daily production.'}</p>${records.length?'<button class="text-button" id="clear-filters">Clear filters</button>':'<button class="text-button" id="sample-button">Explore an example</button>'}</div></td></tr>`;
  const rows=visible.map(row=>{
    const {build:b,current:c}=row.analysis,p=species(b.species),name=b.nickname||p.displayName;
    const subtitle=[name!==p.displayName?p.displayName:'',specialtyLabels[p.specialty]].filter(Boolean).join(' · ');
    const lastValue=sort==='rating'
      ?`<strong class="summary-value">${fmt(c.ratings.strength,1)}</strong>`
      :sort==='speed'
        ?`<strong class="summary-value">${escapeHTML(formatFrequency(b.displayedFrequencySeconds))}</strong>`
        :sort==='rp'?`<strong class="summary-value">${Number.isFinite(c.rp)?fmt(c.rp,0):'—'}</strong>`:specialtyCounts(c,p.specialty).map(metric=>`<span class="specialty-count"><strong class="summary-value">${fmt(metric.value,metric.digits)}</strong><span class="helper-meta">${metric.label}</span></span>`).join('')||'—';
    return `<tr data-id="${escapeHTML(row.id)}"><th scope="row"><button class="helper-name" aria-label="View ${escapeHTML(name)} analysis">${escapeHTML(name)}</button><span class="helper-meta">${escapeHTML(subtitle)}</span></th><td class="num helper-level">${b.level}</td><td class="num"><strong class="summary-value">${fmt(c.strength,0)}</strong></td><td class="num">${lastValue}</td></tr>`;
  }).join('');
  $('collection').innerHTML=`<div class="table-wrap summary-table-wrap"><table class="summary-table"><caption class="visually-hidden">Pokémon collection summary. Total strength is estimated per day. ${description}</caption><colgroup><col class="name-column"><col class="level-column"><col class="strength-column"><col class="output-column"></colgroup><thead><tr><th scope="col">Name</th><th scope="col" class="num">Level</th><th scope="col" class="num">Total strength<span class="column-unit">/ day</span></th><th scope="col" class="num">${lastHeading}<span class="column-unit">${lastUnit}</span></th></tr></thead><tbody>${rows||empty}</tbody></table></div>`;
  // One row handler also receives the name button’s native keyboard click.
  $('collection').querySelectorAll('tr[data-id]').forEach(row=>row.onclick=()=>showDetails(row.dataset.id));
  if($('sample-button'))$('sample-button').onclick=showExample;
  if($('clear-filters'))$('clear-filters').onclick=()=>{$('search').value='';$('type-filter').value='';renderCollection()};
}
function options(values,current,placeholder){return (placeholder?`<option value="">${escapeHTML(placeholder)}</option>`:'')+values.map(v=>{const value=typeof v==='string'?v:v.value,label=typeof v==='string'?v:v.label;return `<option value="${escapeHTML(value)}" ${value===current?'selected':''}>${escapeHTML(label)}</option>`}).join('')}
function field(label,id,value,type='text',attributes=''){return `<label class="field" for="${id}">${label}<input id="${id}" type="${type}" value="${escapeHTML(value??'')}" ${attributes}></label>`}
function getBuild(){
  return {...($('f-species').value==='MEW'?{mainSkill:$('f-mainSkill')?.value||'',mewSkillChance:Number($('f-mewSkillChance').value)}:{}),species:$('f-species').value,nickname:$('f-nickname').value,level:Number($('f-level').value),nature:$('f-nature').value,skillLevel:Number($('f-skillLevel').value),carrySize:Number($('f-carrySize').value),displayedFrequencySeconds:$('f-frequency-minutes').value===''&&$('f-frequency-seconds').value===''?null:Number($('f-frequency-minutes').value)*60+Number($('f-frequency-seconds').value),frequencySource:$('f-frequency-source').value,subskills:unlocks.map(l=>$(`sub-${l}`).value),ingredients:[0,30,60].map(l=>$(`ing-${l}`).value),notes:$('f-notes').value,settings:{energyMultiplier:Number($('s-energy').value),sleepHours:Number($('s-sleep').value),collectionHours:Number($('s-collection').value),areaBonus:Number($('s-area').value),favoriteBerry:$('s-favorite').checked,...(editorFavoriteMultiplier===undefined?{}:{favoriteBerryMultiplier:editorFavoriteMultiplier}),teamHelpingBonus:Number($('s-team').value)}};
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
  editorFavoriteMultiplier=settings.favoriteBerryMultiplier;
  $('editor-title').textContent=editing?'Update your helper':demo?'Try an example build':'Review your helper';
  $('form-status').textContent='';$('save-button').textContent='Analyze & save';
  $('delete-pokemon').hidden=!editing||demo;
  $('editor-body').innerHTML=`${demo?'<div class="notice info">Example only. It becomes part of your collection only if you save it.</div>':''}${context.warnings?`<div class="notice">${context.warnings.map(escapeHTML).join('<br>')}</div>`:'<div class="notice info">Use your Pokémon’s details. Helping frequency and carry limit update automatically when its stats change.</div>'}<div class="preview-strip">${pictureURLs.map((u,i)=>`<img src="${u}" alt="Screenshot ${i+1}">`).join('')}</div><div class="form-grid"><label class="field full" for="f-species">Species<select id="f-species" required>${options(choices.map(p=>({value:p.name,label:p.displayName})),selectedSpecies,'Choose species…')}</select>${editing?'<small>Choose from this Pokémon’s evolution family.</small>':''}</label>${field('Nickname (optional)','f-nickname',build.nickname,'text','maxlength="80"')}${field('Pokémon level','f-level',build.level,'number','min="1" max="100" required')}<label class="field" for="f-nature">Nature<select id="f-nature" required>${options(catalog.natures.map(n=>({value:n.name,label:n.prettyName})),build.nature,'Choose nature…')}</select></label><label class="field" for="f-skillLevel">Displayed main skill level<select id="f-skillLevel" required></select><small id="skill-level-help"></small></label>${field('Carry limit','f-carrySize',build.carrySize,'number','min="1" max="200" required')}<div class="field" id="main-skill-field"></div></div><p class="small" id="carry-help">Carry limit updates for the species, evolution stage, and active Inventory Up subskills. Existing extra carry bonuses are retained. You can correct the value from the game.</p><h3 class="form-section">Helping frequency</h3><input type="hidden" id="f-frequency-source" value="${build.frequencySource==='calculated'?'calculated':'recorded'}"><p class="small" id="frequency-help"></p><div class="form-grid">${field('Minutes','f-frequency-minutes',build.displayedFrequencySeconds?Math.floor(build.displayedFrequencySeconds/60):'','number','min="0" max="1440" step="1" aria-describedby="frequency-help"')}${field('Seconds','f-frequency-seconds',build.displayedFrequencySeconds?build.displayedFrequencySeconds%60:'','number','min="0" max="59" step="1" aria-describedby="frequency-help"')}</div><h3 class="form-section">Ingredient slots</h3><p class="small">Confirm the icons in all three slots. Future slots are used for projections.</p><div class="form-grid" id="ingredient-fields"></div><h3 class="form-section">Subskills</h3>${context.detectedSubskills?.length?`<p class="small">Detected: ${context.detectedSubskills.map(escapeHTML).join(', ')}. Verify each unlock level.</p>`:''}<div class="subskill-grid">${unlocks.map((l,i)=>`<label class="field" for="sub-${l}">Unlocks at Lv. ${l}<select id="sub-${l}">${options(catalog.subskills.map(s=>s.name),build.subskills?.[i],'Unknown / no bonus modeled')}</select></label>`).join('')}</div><details><summary>Daily routine & analysis settings</summary><p class="small">These assumptions affect output. The 2.2× energy setting is an average scenario, not an energy simulation.</p><div class="form-grid"><div id="mew-skill-assumption" class="field full" ${p?.name==='MEW'?'':'hidden'}>${field('Assumed Mew base skill chance (%)','f-mewSkillChance',build.mewSkillChance??4,'number','min="0.01" max="100" step="0.01"')}<small>Mew’s skill and ingredient rates are unverified. Change this assumption if you have a measured rate for the selected skill.</small></div>${field('Average energy speed multiplier','s-energy',settings.energyMultiplier,'number','min="1" max="2.5" step="0.1" required')}${field('Sleep hours (no collection)','s-sleep',settings.sleepHours,'number','min="0" max="12" step="0.5" required')}${field('Collect every (awake hours)','s-collection',settings.collectionHours,'number','min="0.25" max="12" step="0.25" required')}${field('Area bonus (%)','s-area',settings.areaBonus,'number','min="0" max="100" step="1" required')}${field('Other teammates with Helping Bonus','s-team',settings.teamHelpingBonus,'number','min="0" max="4" step="1" required')}<label class="check-row"><input id="s-favorite" type="checkbox" ${settings.favoriteBerry?'checked':''}>Snorlax’s favorite berry</label></div></details><label class="field" for="f-notes">Notes<textarea id="f-notes" rows="2" maxlength="4000" placeholder="Anything you want to remember…">${escapeHTML(build.notes||'')}</textarea></label>${ocrText?`<details><summary>Recognized screenshot text</summary><pre>${escapeHTML(ocrText)}</pre></details>`:''}<p class="small">Saving updates a matching Pokémon, including level changes and subskill upgrades. The previous analysis stays in its history.</p>`;
  renderIngredientFields(build.ingredients);renderMainSkillField(build.mainSkill,build.skillLevel);
  $('f-species').onchange=()=>{const selected=[0,30,60].map(l=>$(`ing-${l}`).value),p=species($('f-species').value);renderMainSkillField();const matched=resolveIngredients(context.ingredientMatches||[],p);renderIngredientFields(editing?selected:matched.ingredients);if(matched.warnings.length)toast(matched.warnings.join(' '))};
  const key=stat=>{const b=getBuild();return JSON.stringify([b.species,calculatedStats(catalog,b)[stat]])};
  const setFrequency=(seconds,source)=>{
    $('f-frequency-minutes').value=seconds?Math.floor(seconds/60):'';
    $('f-frequency-seconds').value=seconds?seconds%60:'';
    $('f-frequency-source').value=source;
  };
  const describeFrequency=()=>{
    $('frequency-help').textContent=$('f-frequency-source').value==='calculated'
      ?'Calculated from species, level, nature, and active Helping Speed subskills. Ribbon and temporary bonuses are not included. You can enter the value shown in game.'
      :'Use the value shown in game. Changes to species, level, nature, or active Helping Speed subskills recalculate it automatically.';
  };
  const initial=calculatedStats(catalog,getBuild());
  if(!Object.hasOwn(build,'displayedFrequencySeconds')&&$('f-frequency-minutes').value===''&&$('f-frequency-seconds').value==='')setFrequency(initial.frequencySeconds,'calculated');
  if($('f-carrySize').value==='')$('f-carrySize').value=initial.carrySize??'';
  let carryAnchor=context.statAnchors?.carry||getBuild(),frequencyAnchor=context.statAnchors?.frequency||{key:key('frequencySeconds'),build:getBuild()};
  editorStatAnchors={carry:carryAnchor,frequency:frequencyAnchor};
  let lastFrequencyKey=key('frequencySeconds'),lastCarryKey=key('carrySize');
  const updateStats=event=>{
    const id=event.target.id;if(id==='f-mainSkill')renderSkillLevels();if(['f-mainSkill','f-skillLevel'].includes(id))describeMainSkill();
    if(id==='f-carrySize')carryAnchor=getBuild();
    if(['f-frequency-minutes','f-frequency-seconds'].includes(id)){
      $('f-frequency-source').value='recorded';frequencyAnchor={key:key('frequencySeconds'),build:getBuild()};
    }
    const current=getBuild(),frequencyKey=key('frequencySeconds'),carryKey=key('carrySize');
    if(frequencyKey!==lastFrequencyKey){
      const original=frequencyKey===frequencyAnchor.key;
      setFrequency(original?frequencyAnchor.build.displayedFrequencySeconds:calculatedStats(catalog,current).frequencySeconds,original?frequencyAnchor.build.frequencySource:'calculated');
      lastFrequencyKey=frequencyKey;
    }
    if(carryKey!==lastCarryKey){
      $('f-carrySize').value=updatedCarrySize(catalog,current,carryAnchor)??'';
      // A new entry may switch to an unrelated species; do not carry its bonuses over.
      if(species(current.species)&&!speciesChoices(catalog,carryAnchor.species).some(p=>p.name===current.species))carryAnchor=getBuild();
      lastCarryKey=carryKey;
    }
    editorStatAnchors={carry:carryAnchor,frequency:frequencyAnchor};
    describeFrequency();
  };
  describeFrequency();
  $('editor-body').onchange=event=>{updateStats(event);saveDraft()};
  $('editor-body').oninput=event=>{updateStats(event);clearTimeout(saveDraft.timer);saveDraft.timer=setTimeout(saveDraft,400)};
  editorBaseline=editorSnapshot();
  pendingEntry=!!context.resumed||(!editing&&!demo&&(imageIds.length>0||Object.keys(build).length>0));
  ownsDraft=!!context.resumed;
  if(!$('editor').open)$('editor').showModal();
  if(pendingEntry)saveDraft();
}
function renderMainSkillField(selected='',level=$('f-skillLevel').value){
  const p=species($('f-species').value),choices=mainSkillOptions(catalog,p?.name);
  $('main-skill-field').classList.toggle('full',choices.length>0);
  $('main-skill-field').innerHTML=choices.length
    ?`<label for="f-mainSkill">Mew’s main skill</label><select id="f-mainSkill">${options(choices,selected,'Unknown / choose current skill…')}</select><small id="main-skill-help"></small>`
    :`<span>Main skill</span><span class="small">${escapeHTML(p?.skillLabel||'Choose a species')}</span><small>Use the displayed main skill level.</small>`;
  renderSkillLevels(level);
  $('mew-skill-assumption').hidden=p?.name!=='MEW';
  $('f-mewSkillChance').disabled=p?.name!=='MEW';
  describeMainSkill();
}
function renderSkillLevels(current=$('f-skillLevel').value){
  const levels=skillLevelOptions(catalog,{species:$('f-species').value,mainSkill:$('f-mainSkill')?.value});
  const chosen=current?String(Math.min(Math.max(1,Number(current)),levels.at(-1)||1)):'';
  $('f-skillLevel').innerHTML=options(levels.map(level=>({value:String(level),label:`Lv. ${level}`})),chosen,'Choose level…');
  $('f-skillLevel').disabled=!levels.length;
  $('skill-level-help').textContent=Number(current)>Number(chosen)?`Previous level ${current} exceeds this skill’s maximum. Saving will use Lv. ${chosen}.`:'';
}
function describeMainSkill(){
  if(!$('main-skill-help'))return;
  const b={species:$('f-species').value,mainSkill:$('f-mainSkill').value,skillLevel:Number($('f-skillLevel').value)},main=resolveMainSkill(catalog,b);
  $('main-skill-help').textContent=b.mainSkill
    ?`Choose a valid level for this skill (1–${main.skill.RP.length}). Switching to a lower-cap skill reduces the selection to its maximum. Mew’s rates are provisional; see Daily routine & analysis settings.`
    :'Choose the effect shown in game. Unknown skills contribute no skill strength or skill berries.';
}
function renderIngredientFields(selected=[]){
  const p=species($('f-species').value);
  $('ingredient-fields').innerHTML=[0,30,60].map((l,i)=>`<label class="field" for="ing-${l}">Lv. ${l||1}<select id="ing-${l}" required ${p?'':'disabled'}>${options((p?.[`ingredient${l}`]||[]).map(x=>({value:x.ingredient.name,label:`${x.ingredient.longName} ×${x.amount}`})),selected?.[i]||(i===0?p?.ingredient0[0].ingredient.name:undefined),'Confirm ingredient…')}</select></label>`).join('');
}
function editorSnapshot(){return JSON.stringify([...$('editor-body').querySelectorAll('input,select,textarea')].map(field=>[field.id,field.type==='checkbox'?field.checked:field.value]))}
function hasUnsavedChanges(){return $('editor').open&&(pendingEntry||editorSnapshot()!==editorBaseline)}
function saveDraft(){
  if(!$('editor').open||saving||closingEditor||!$('f-species'))return;
  if(hasUnsavedChanges()){ownsDraft=true;cachePut('draft',{id:editing,build:getBuild(),imageIds,statAnchors:editorStatAnchors})}
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
async function deleteEditedPokemon(){
  if(!editing||demo||!$('editor').open||saving||closingEditor)return;
  const id=editing,saved=records.find(row=>row.id===id);
  if(!saved){toast('This Pokémon is no longer in the collection. Reload and try again.');return}
  if(!online){$('form-status').textContent='Device storage is unavailable. Reload and try again.';return}
  const name=saved.analysis.build.nickname;
  if(!confirm(`Delete ${name} and its saved screenshots?${hasUnsavedChanges()?' Your unsaved edits will also be discarded.':''} This cannot be undone.`))return;
  clearTimeout(saveDraft.timer);
  const controls=[...$('pokemon-form').elements].map(field=>[field,field.disabled]);
  saving=true;for(const [field] of controls)field.disabled=true;
  $('form-status').textContent='Deleting Pokémon…';
  let deleted=false;
  try{
    await api(`/api/pokemon/${encodeURIComponent(id)}`,{method:'DELETE'});deleted=true;
    pendingEntry=false;editorBaseline='';await clearEditorDraft();
    // A clean editor may have an older, unresumed draft for this same record.
    const draft=await cacheGet('draft');
    if(draft?.id===id){await cachePut('draft',null);if($('resume-draft'))$('upload-status').textContent=''}
    $('editor').close();editing=null;imageIds=[];
    pictureURLs.forEach(URL.revokeObjectURL);pictureURLs=[];
    records=records.filter(row=>row.id!==id);await cachePut('records',records);renderCollection();
    toast('Pokémon deleted.');
  }catch(error){
    if(deleted){$('editor').close();editing=null;toast('Pokémon deleted. Reload to refresh the collection.');}
    else{$('form-status').textContent=error.message;saving=false;saveDraft()}
  }finally{saving=false;for(const [field,disabled] of controls)field.disabled=disabled}
}
$('delete-pokemon').onclick=deleteEditedPokemon;
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
function natureBadges(name){
  const nature=catalog.natures.find(n=>n.name===name);
  if(!nature)return '';
  if(nature.positiveModifier==='neutral'&&nature.negativeModifier==='neutral')return '<span class="nature-effect neutral">Neutral</span>';
  const labels={speed:['Speed','Helping speed'],energy:['Energy','Energy recovery'],ingredient:['Ingredients','Ingredient finding'],skill:['Skill','Main skill chance'],exp:['EXP','EXP gains']};
  return [['up',nature.positiveModifier],['down',nature.negativeModifier]].map(([direction,key])=>{
    if(!labels[key])return '';
    const [short,label]=labels[key],description=`${label} ${direction==='up'?'increased':'decreased'}`;
    return `<span class="nature-effect ${direction}" role="img" aria-label="${description}" title="${description}"><span aria-hidden="true"><span class="nature-arrow">${direction==='up'?'▲':'▼'}</span> ${short}</span></span>`;
  }).join('');
}
function pokemonStats(build,rp){
  return `<section class="pokemon-own-stats" aria-label="Pokémon stats"><div class="frequency-stat"><div class="nature-stat"><h3>Nature</h3><div class="nature-summary"><strong>${escapeHTML(build.nature||'Not recorded')}</strong><span class="nature-effects">${natureBadges(build.nature)}</span></div></div><h3>Estimated RP</h3><strong>${Number.isFinite(rp)?fmt(rp,0):'—'}</strong><p class="small">${build.level>70?'RP is unavailable above Lv. 70 because the growth data is unverified.':build.species==='MEW'?(build.mainSkill?'Provisional RP using Mew’s assumed rates and selected skill; may differ from the game.':'Choose Mew’s main skill to estimate RP.'):'Research Power from this Pokémon’s build. Excludes ribbon and mint effects, island bonuses, and teammates.'}</p><h3>Helping frequency</h3><strong>${formatFrequency(build.displayedFrequencySeconds)}</strong><p class="small">${(build.settings.helpingFrequencyFactor??1)!==1?`Calculated with the selected island/custom interval factor (${fmt(build.settings.helpingFrequencyFactor,2)}×). Uses species, level, nature, and active Helping Speed subskills; excludes ribbons and Helping Bonus.`:build.frequencySource==='calculated'?'Calculated from this Pokémon’s species, level, nature, and active Helping Speed subskills; excludes ribbon and temporary bonuses.':build.displayedFrequencySeconds?'From this Pokémon’s stats in game.':'Open Edit & recalculate to calculate this Pokémon’s frequency.'}</p><p class="small">Carry limit: <strong class="carry-value">${build.carrySize}</strong></p></div><h3>Subskills by level</h3><div class="table-wrap"><table class="subskill-levels"><thead><tr><th scope="col">Unlock level</th><th scope="col">Subskill</th><th scope="col">Status</th></tr></thead><tbody>${subskillSlots(build).map(slot=>`<tr><th scope="row">Lv. ${slot.level}</th><td>${escapeHTML(slot.name)}</td><td>${slot.unlocked?(slot.name==='Unknown'?'Unlocked':'Active'):'Locked'}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function ingredientTable(items){return `<div class="table-wrap"><table><thead><tr><th>Ingredient</th><th class="num">Per day</th><th class="num">Raw strength</th><th class="num">Percentile</th></tr></thead><tbody>${items.map(i=>`<tr><td>${escapeHTML(i.longName)}${!i.count?'<br><span class="small">Not produced by active slots</span>':''}</td><td class="num">${fmt(i.count,2)}</td><td class="num">${fmt(i.strength,0)}</td><td class="num">${i.rating==null?'—':`${i.rating}/100`}</td></tr>`).join('')}</tbody></table></div>`}
function closeDetails(){
  detailRequest++;detailLoading=false;detailId=null;detailOrder=[];
  $('details').close();$('detail-body').removeAttribute('aria-busy');
}
function detailNavigation(){
  const n=detailNeighbors(detailOrder,detailId);
  if(n.index<0||n.total<2)return '';
  return `<nav class="detail-navigation" aria-label="Pokémon navigation"><div class="detail-navigation-controls"><button class="secondary" id="previous-pokemon" ${n.previous?'':'disabled'}>Previous</button><span class="small" aria-live="polite">${n.index+1} of ${n.total}</span><button class="secondary" id="next-pokemon" ${n.next?'':'disabled'}>Next</button></div><p class="small">Swipe left for next · right for previous</p></nav>`;
}
function updateDetailButtons(){
  const n=detailNeighbors(detailOrder,detailId);
  if($('previous-pokemon'))$('previous-pokemon').disabled=detailLoading||!n.previous;
  if($('next-pokemon'))$('next-pokemon').disabled=detailLoading||!n.next;
}
function navigateDetails(direction){
  if(!$('details').open||detailLoading||!detailId)return;
  const n=detailNeighbors(detailOrder,detailId),target=direction<0?n.previous:n.next;
  if(target)void showDetails(target,undefined,true);
}
attachDetailSwipes($('details'),{enabled:()=>$('details').open&&!detailLoading&&detailOrder.length>1&&detailNeighbors(detailOrder,detailId).index>=0,navigate:navigateDetails});
$('details').oncancel=event=>{event.preventDefault();closeDetails()};
$('details').onkeydown=event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.closest('input,select,textarea,[contenteditable],.table-wrap,pre'))return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();navigateDetails(event.key==='ArrowLeft'?-1:1)}
};
async function showDetails(id,example,navigating=false){
  const request=++detailRequest;detailLoading=true;updateDetailButtons();$('detail-body').setAttribute('aria-busy','true');
  try{
    const row=example|| (online?await api(`/api/pokemon/${encodeURIComponent(id)}`):records.find(p=>p.id===id));
    if(request!==detailRequest)return;
    if(!row)throw new Error('This helper is no longer available.');
    detailId=example?null:row.id;
    if(!navigating)detailOrder=example?[]:visibleCollection().map(row=>row.id);
    const savedBuild=row.analysis.build,team=berryTeamFor(row),a=levelPreview(row.analysis,levelOverride,{full:true,favoriteBerries:favoriteBerryConfig,...team}),b=a.build,c=a.current,p=species(b.species),main=resolveMainSkill(catalog,b);
    $('detail-body').innerHTML=`<div class="dialog-header"><div><span class="section-number">${levelOverride!==null?'TEMPORARY PREVIEW':example?'EXAMPLE · NOT SAVED':favoriteBerryConfig!==null||team.berryTeam!==null?'COLLECTION ESTIMATE':'SAVED ANALYSIS'} · LV. ${b.level}</span><h2 id="detail-title" tabindex="-1">${escapeHTML(b.nickname)}</h2><span class="small">${escapeHTML(p.displayName)} · ${escapeHTML(p.specialty)} specialist</span></div></div>${detailNavigation()}<div class="detail-content">${levelOverride!==null?`<p class="notice info">Viewing Lv. ${b.level} temporarily. ${example?"Example":"Saved"} level: ${savedBuild.level}. Main skill level is unchanged. ${example?"The example":"Editing"} uses the original stats.</p>`:""}${favoriteBerryConfig!==null?`<p class="notice info">${escapeHTML(describeFavorites(favoriteBerryConfig,catalog))} This Pokémon’s ${escapeHTML(berryOptions(catalog).find(berry=>berry.value===p.berry.name).name)} berries use ${favoriteMultiplier(b.settings)}× strength.</p>`:""}${pokemonStats(b,c.rp)}<h3>Estimated daily output</h3><p class="small">Expected output per 24 hours · ${escapeHTML(main.label)} Lv. ${b.skillLevel}</p><div class="metrics">${[['Skill triggers',fmt(c.skillTriggers,2),c.ratings.skillTriggers],['Total strength',fmt(c.strength,0),c.ratings.strength],['Ingredients',fmt(c.ingredientCount),c.ratings.ingredientCount],['Total berries',fmt(c.berryCount),c.ratings.berryCount]].map(([label,n,r])=>`<div class="metric"><label>${label} / day</label><strong>${n}</strong><small>Percentile ${r} / 100</small></div>`).join('')}</div>${c.berrySkill?`<p class="small">Total berries: ${fmt(c.gatheredBerryCount)} gathered + ${fmt(c.ownSkillBerryCount)} own skill berries${c.teamBerryMode?` + ${fmt(c.teamSkillBerryCount)} teammate berries`:''}. Skill berries are included in total strength once.</p>`:''}${c.teamBerryMode?`<section class="berry-team-summary notice info"><strong>Berry Burst teammates</strong><p>${c.teamBerryMode==='automatic'?'Automatic estimate · Four teammates with this Pokémon’s level, berry type, and favorite bonus.':`${c.teamMemberCount} selected teammate${c.teamMemberCount===1?'':'s'} · Uses their own levels and berry bonuses. Empty slots contribute zero.`}</p>${team.missing?`<p>${team.missing} selected teammate(s) are no longer in your collection and contribute zero. Choose replacements below.</p>`:''}${example?'<p>Save this Pokémon to select teammates.</p>':'<button class="secondary" id="choose-berry-team" aria-haspopup="dialog">Choose teammates</button>'}</section>`:''}<p class="small">Ratings compare ${a.referenceCount.toLocaleString()} uniformly sampled builds of ${escapeHTML(p.displayName)} at Lv. ${b.level}, with the same ingredient slots, selected main skill, main skill level, and teammate assumptions. They are model percentiles, not a player-population ranking.</p>${a.warnings.map(w=>`<div class="notice">${escapeHTML(w)}</div>`).join('')}<h3>Every possible ingredient</h3><p class="small">Gathered output for the selected slots. Unselected or locked ingredients show zero.</p>${ingredientTable(c.ingredients)}${c.randomIngredients?`<p class="notice info">Ingredient Magnet adds an estimated <strong>${fmt(c.randomIngredients)} random ingredients / day</strong>. These are separate from gathered counts; ingredient types depend on what you have unlocked.</p>`:''}<details open><summary>Where the strength comes from</summary><table><tbody><tr><td>${fmt(c.gatheredBerryCount)} gathered berries</td><td class="num">${fmt(c.berryStrength-c.skillBerryStrength,0)}</td></tr>${c.berrySkill?`<tr><td>${fmt(c.ownSkillBerryCount)} own skill berries</td><td class="num">${fmt(c.ownSkillBerryStrength,0)}</td></tr>`:''}${c.teamBerryMode?`<tr><td>${fmt(c.teamSkillBerryCount)} ${c.teamBerryMode==='automatic'?'estimated ':''}teammate skill berries</td><td class="num">${fmt(c.teamSkillBerryStrength,0)}</td></tr>`:''}<tr><td>Gathered ingredients at base value</td><td class="num">${fmt(c.ingredientStrength,0)}</td></tr><tr><td>Modeled direct skill strength</td><td class="num">${fmt(c.skillStrength,0)}</td></tr></tbody></table><p class="small">Raw strength is a comparison estimate. Recipe bonuses, critical meals, unmodeled support effects, other skills’ teammate berries, and random ingredient skill strength are excluded.</p></details>${a.forecasts.length?`<details><summary>Future levels · same build</summary><table><thead><tr><th>Level</th><th class="num">Skills / day</th><th class="num">Ingredients / day</th><th class="num">Raw strength</th></tr></thead><tbody>${a.forecasts.map(f=>`<tr><td>${f.level}</td><td class="num">${fmt(f.skillTriggers,2)}</td><td class="num">${fmt(f.ingredientCount)}</td><td class="num">${fmt(f.strength,0)}</td></tr>`).join('')}</tbody></table><p class="small">Applies future subskill and ingredient unlocks; keeps the displayed main skill level unchanged. Lv. 80 is a hypothetical estimate. Selected teammates keep their current preview levels; automatic teammates follow this Pokémon’s projected level.</p></details>`:''}<details><summary>Compare all ingredient combinations at Lv. 60</summary><p class="small">Hypothetical builds of this species with your nature and subskills. Your actual ingredient slots cannot be changed in game.</p><div class="table-wrap"><table><thead><tr><th>Lv. 1 / 30 / 60</th><th>Daily ingredients</th><th class="num">Total / day</th></tr></thead><tbody>${a.ingredientAlternatives.map(v=>`<tr><td>${v.slots.map(escapeHTML).join(' / ')}</td><td>${v.ingredients.filter(i=>i.count>0).map(i=>`${escapeHTML(i.name)} ${fmt(i.count)}`).join(', ')}</td><td class="num">${fmt(v.ingredientCount)}</td></tr>`).join('')}</tbody></table></div></details><details><summary>Routine, assumptions & provenance</summary><p class="small">${b.settings.sleepHours} hours asleep · collect every ${b.settings.collectionHours} awake hours · ${b.settings.energyMultiplier}× average energy speed · ${b.settings.areaBonus}% area bonus · ${favoriteMultiplier(b.settings)}× berry strength · ${b.carrySize} carry limit.</p><p class="small">Modeled help frequency: ${fmt(c.frequencySeconds/60,1)} minutes. Ingredient chance: ${fmt(c.ingredientRate*100,2)}%. Skill chance: ${fmt(c.skillRate*100,2)}%. Inventory saturation and skill banking are approximations. No pity triggers, ribbons, camp, event bonuses, or energy-skill feedback.</p><p class="small">Model ${escapeHTML(a.modelVersion)} · <a href="https://github.com/nerolis-lab/nerolis-lab/tree/${a.catalogCommit}" target="_blank" rel="noopener">Neroli’s Lab catalog</a> · ${row.historyCount||1} saved analysis version(s).</p></details>${b.notes?`<p>${escapeHTML(b.notes)}</p>`:''}</div><div class="dialog-footer"><button class="secondary" data-close="details">Close</button><button class="primary" id="edit-pokemon">${example?'Use this example':levelOverride!==null?'Edit saved Pokémon':'Edit & recalculate'}</button></div>`;
    bindClose($('details'));$('edit-pokemon').onclick=()=>{closeDetails();openEditor(savedBuild,{id:example?null:row.id,imageIds:row.screenshots?.map(s=>s.id)||[],demo:!!example})};
    if($('choose-berry-team'))$('choose-berry-team').onclick=()=>openBerryTeam(row.id);
    if($('previous-pokemon'))$('previous-pokemon').onclick=()=>navigateDetails(-1);
    if($('next-pokemon'))$('next-pokemon').onclick=()=>navigateDetails(1);
    if(!$('details').open)$('details').showModal();
    $('details').scrollTop=0;
    if(navigating)$('detail-title').focus({preventScroll:true});
  }catch(e){if(request===detailRequest)toast(e.message)}
  finally{if(request===detailRequest){detailLoading=false;$('detail-body').removeAttribute('aria-busy');updateDetailButtons()}}
}
async function showExample(){
  if(!catalog)return;const p=species('RAICHU');
  const build={species:p.name,nickname:'Raichu · example',level:30,nature:'Adamant',skillLevel:3,carrySize:31,subskills:['Berry Finding S','Helping Speed M','Skill Trigger M','Helping Bonus','Ingredient Finder M'],ingredients:['Apple','Ginger','Apple'],settings:catalog.defaults,notes:''};
  if(!online){openEditor(build,{demo:true});return}
  try{const a=await api('/api/analyze',{method:'POST',body:JSON.stringify({build})});await showDetails(null,{analysis:a})}catch(e){toast(e.message)}
}
function renderMethod(){
  $('method-body').innerHTML=`<p><strong>Sleep Atlas is your private research notebook.</strong> Screenshots are read on your device with Tesseract.js. Pokémon, images, analysis history, and calculated results are saved in this browser’s local database. Your screenshots are not sent to a server. Each device and browser has its own collection.</p><h3>What a rating means</h3><p>Each metric receives a percentile against 1,000 deterministic, uniformly sampled builds of the same species and level, with identical ingredient slots, routine, and displayed main skill level. Each reference has one of 25 natures and five unique subskills; only unlocked subskills apply. Inventory bonuses are adjusted between builds. A score of 90 means the metric exceeds about 90% of these synthetic builds. This is not RaenonX’s rating or a rarity-weighted population percentile. Ties share a midpoint rank.</p><h3>Estimated RP</h3><p>Research Power uses the Pokémon’s species, level, nature, unlocked ingredient slots and subskills, and main skill level. It uses five hours of base help output, catalog skill RP weights, and nature/subskill bonuses. It is separate from daily strength and percentile ratings. Favorite berries, island effects, routines, carry size, and teammate choices do not change RP. Ribbon and neutralizing mint effects are not recorded, so the estimate can differ from the game. Mew uses provisional rates and the selected skill’s RP weights; an unknown skill has no RP estimate. RP above level 70 is unavailable because ingredient growth is unverified. Temporary levels through 70 recalculate RP. Choose Highest RP to show RP in the last collection column. Teammate choices use RP, highest first.</p><h3>Daily output</h3><p>Species rates, level, nature, and active subskills determine help frequency and ingredient/skill chances. A selectable average energy-speed multiplier is held constant across the day. The model estimates inventory filling between collections, berry-only sneaky snacking, and one banked skill (two for skill specialists). It does not simulate exact help timing, energy recovery, pity triggers, ribbons, camp, event bonuses, or feedback between team skills.</p><p><strong>Raw strength</strong> combines gathered berries, modeled skill berries, gathered ingredients at base value, and supported direct skill strength, with your area bonus. Berry Burst (including Mew’s selected Berry Burst), Disguise, Draco Meteor, and Lunar Blessing use their own berries per activation and the Pokémon’s berry value at its level. Ordinary Berry Burst automatically estimates four teammates with the user’s level, berry type, and favorite bonus. At skill level 6, that adds 20 teammate berries to 30 own berries per activation. In Pokémon details, choose teammates to use up to four saved Pokémon with their own levels and berry bonuses; empty or unavailable slots contribute zero. Island settings and temporary levels apply to teammates too. Own and teammate contributions appear separately and are counted once in strength and total berries. Ratings use the same teammate assumptions. Selected teammates keep their current preview levels in future-level forecasts; automatic teammates follow the projected Pokémon level. Other berry skills retain their solo baseline; their teammates’ berries, Disguise Great Success, and Berry Zone strength boosts are excluded. Favorite-berry and area bonuses apply to skill berries too. Use Favorite berries in the collection menu to select an island preset, or set up to three berries and a 2× or 2.4× multiplier manually. Fixed islands fill their berries at 2×. Choosing Greengrass clears the berries and resets the multiplier to 2×. Expert areas require weekly manual berry choices; bonuses other than speed and selected berry strength are not modeled. Custom / event lets you adjust any preset. GGEX applies a 10% shorter interval to the first favorite and a 15% longer interval to non-favorites; Cyan Expert uses 20% and 35%. The other two favorites keep normal speed. Custom / event lets you adjust both speed changes from −50% to +50%; positive means shorter intervals. Island speed changes update helping frequency, production, sorting, ratings, and forecasts. These device settings update collection and detail estimates, including temporary levels, while keeping saved Pokémon builds unchanged. Unselected berry types use ordinary strength; Use saved settings restores each Pokémon’s individual preference. Recipe bonuses, critical dishes, indirect support effects, special skill modifiers, and random ingredient skill strength are excluded. Ingredient Magnet rewards appear separately. The result is useful for comparison; it is not an exact forecast of Snorlax’s final strength.</p><p>Mew’s main skill can be selected in its editor. Its skill and ingredient rates are provisional; the base skill chance defaults to a 4% assumption and can be changed under Daily routine & analysis settings. The skill-level dropdown offers only levels supported by the selected skill. Switching to a lower-cap skill reduces the selection; saving applies that new level. Existing backups remain compatible and calculations cap legacy levels at the selected skill’s maximum. Metronome randomness, candy rewards, and energy feedback are excluded.</p><h3>Reading screenshots</h3><p>English text is supported. Add several detail screens for one Pokémon at a time. The reader compares the small Pokémon picture with reference sprites, so nicknames do not prevent recognition. Similar forms or uncertain pictures may still need manual species selection. Nickname text in other languages must be entered manually. The second and third ingredient icons are compared with reference pictures, including faded locked slots. A close match fills the slot only when it is valid for that species and quantity. The first ingredient comes from the species catalog. Confirm all slots; obscured or uncertain icons need manual selection. Verify subskill unlock positions, nature, level, displayed carry limit, and main skill level before saving. Uncertain or missing fields remain editable. Screenshots with no readable text still need manual entry.</p><h3>On your phone</h3><p>Open this site in Safari, tap Share, choose Add to Home Screen, enable Open as Web App if shown, then tap Add. Your Mac does not need to be running. Launch from the same app icon each time so you use the same device collection.</p><p>Use Download for offline use in the collection menu and wait for Ready for offline use before disconnecting. This saves and verifies the app and all screenshot reader files so you can reopen, calculate, save, and read screenshots offline. Download in the same browser or Home Screen app you will use offline. Your ChatGPT sign-in may still require an internet connection.</p><h3>Saving & matching Pokémon</h3><p>Save directly after entering the details. A new entry updates a saved Pokémon when species, nature, ingredient slots, and subskill positions match, allowing level changes and subskill upgrades within the same family. Carry limit and main skill level must match or reflect those subskill bonuses. Nicknames and daily routine settings do not prevent a match. The latest entry appears in your collection; previous analyses remain in its local history.</p><h3>Backups & data</h3><p>Export regularly: clearing browser data or removing the home-screen app can remove its collection. Browser storage is not a cloud backup. Export a JSON backup on one device, then Restore it on another. Backups from the Mac app are compatible. Restore adds new Pokémon and overwrites compatible saved Pokémon with the imported build, then recalculates their results. Nature, ingredient slots, selected Mew skill, and subskill positions must match; S/M/L changes within the same subskill family are compatible. Existing IDs take priority, including evolution within the same family. A different ID can update a unique match of the same species. Imported level, main skill level, carry limit, notes, and settings take precedence. Conflicting or ambiguous matches are skipped and reported. Previous analyses and local screenshots are retained when the backup has no images. Export includes Pokémon builds and settings. Teammate choices and island preferences stay on this device and are not exported. Screenshot images, recognized text, and past analysis versions stay on this device and are excluded from exports. Older backups containing screenshots can still be restored.</p><h3>Catalog updates</h3><p>Pokémon data is bundled with each Sleep Atlas release, so new species and stat corrections require an app update. Check for updates downloads the latest published app and catalog; it does not query live game data. The source date below identifies this snapshot. Ingredient and skill rates are community-researched estimates.</p><h3>Sources</h3><p>${catalog.species.length} Pokémon and forms from <a href="https://github.com/nerolis-lab/nerolis-lab/tree/${catalog.commit}" target="_blank" rel="noopener">Neroli’s Lab</a>, pinned to commit ${catalog.commit.slice(0,10)} and retrieved ${catalog.retrieved}. Dataset distributed under Apache 2.0; source and license notices are included with this project. Pokémon is owned by its respective rights holders. This is an unofficial fan project.</p>`;
}
let berryTeamOwner=null,savingBerryTeam=false;
function teammateChoices(ownerId){
  return records.filter(row=>row.id!==ownerId).map(row=>{
    const analysis=levelPreview(row.analysis,levelOverride,{favoriteBerries:favoriteBerryConfig,...berryTeamFor(row)}),build=analysis.build;
    return {value:row.id,label:`${build.nickname} · ${species(build.species).displayName} · Lv. ${build.level} · RP ${Number.isFinite(analysis.current.rp)?fmt(analysis.current.rp,0):'—'}`,rp:analysis.current.rp};
  }).sort((a,b)=>(b.rp??-Infinity)-(a.rp??-Infinity)||a.label.localeCompare(b.label)||a.value.localeCompare(b.value));
}
function openBerryTeam(id){
  berryTeamOwner=id;
  const ids=berryTeams[id]||[],choices=teammateChoices(id);
  $('berry-team-mode').value=Object.hasOwn(berryTeams,id)?'selected':'automatic';
  $('berry-team-fields').innerHTML=[0,1,2,3].map(i=>{
    const available=[...choices];if(ids[i]&&!available.some(choice=>choice.value===ids[i]))available.push({value:ids[i],label:'Unavailable Pokémon · choose a replacement'});
    return `<label class="field" for="berry-teammate-${i}">Teammate ${i+1}<select id="berry-teammate-${i}">${options(available,ids[i],'Empty slot')}</select></label>`;
  }).join('');
  $('berry-team-status').textContent='';updateBerryTeamChoices();$('berry-team-dialog').showModal();
}
function updateBerryTeamChoices(){
  const manual=$('berry-team-mode').value==='selected';$('berry-team-fields').hidden=!manual;
  const fields=[0,1,2,3].map(i=>$(`berry-teammate-${i}`)),selected=fields.map(field=>field.value).filter(Boolean);
  for(const field of fields)for(const option of field.options)option.disabled=!!option.value&&option.value!==field.value&&selected.includes(option.value);
}
async function applyBerryTeam(){
  if(savingBerryTeam)return;
  const owner=berryTeamOwner,controls=[...$('berry-team-form').elements].map(field=>[field,field.disabled]);
  savingBerryTeam=true;for(const [field] of controls)field.disabled=true;
  try{
    if(!records.some(row=>row.id===owner))throw Error('This Pokémon is no longer available.');
    const ids=$('berry-team-mode').value==='automatic'?null:validateBerryTeamIds([0,1,2,3].map(i=>$(`berry-teammate-${i}`).value).filter(Boolean),owner);
    if(ids?.some(id=>!records.some(row=>row.id===id)))throw Error('Replace or clear unavailable teammates before applying.');
    const db=await cacheDB;let next;
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('cache','readwrite'),store=tx.objectStore('cache'),read=store.get('berry-teams');
      read.onsuccess=()=>{next={...(read.result||{})};if(ids===null)delete next[owner];else next[owner]=ids;store.put(next,'berry-teams')};
      tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('Could not save teammate settings.'));
    });
    berryTeams=next;renderCollection();$('berry-team-dialog').close();
    await showDetails(owner,undefined,true);toast('Berry Burst teammate settings applied.');
  }catch(error){$('berry-team-status').textContent=error.message||'Could not save teammate settings.'}
  finally{savingBerryTeam=false;for(const [field,disabled] of controls)field.disabled=disabled}
}
$('berry-team-mode').onchange=updateBerryTeamChoices;
$('berry-team-fields').onchange=updateBerryTeamChoices;
$('berry-team-form').onsubmit=event=>{event.preventDefault();void applyBerryTeam()};
$('berry-team-dialog').oncancel=event=>{if(savingBerryTeam)event.preventDefault()};
function bindClose(root=document){root.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.dataset.close==='editor'?requestEditorClose():b.dataset.close==='details'?closeDetails():$(b.dataset.close).close())}
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
let savingFavorites=false;
function openFavoriteBerries(){
  if(!catalog){toast('Load the collection first.');return}
  closeActions(true);
  const values=favoriteBerryConfig||islandFavorites('greengrass');
  $('favorite-island').innerHTML=options(FAVORITE_ISLANDS,values.island||'custom');
  const choices=berryOptions(catalog);
  $('favorite-berry-fields').innerHTML=[0,1,2].map(i=>`<label class="field" for="favorite-berry-${i}">Favorite berry ${i+1}<select id="favorite-berry-${i}">${options(choices,values.berries[i],'None')}</select></label>`).join('');
  $('favorite-berry-multiplier').value=values.multiplier;
  $('favorite-speed').value=values.favoriteSpeed||0;$('non-favorite-speed').value=values.nonFavoriteSpeed||0;
  $('favorite-berries-status').textContent='';$('reset-favorite-berries').disabled=favoriteBerryConfig===null;
  updateFavoriteIslandControls();updateFavoriteChoices();$('favorite-berries-dialog').showModal();
}
function updateFavoriteIslandControls(){
  const island=FAVORITE_ISLANDS.find(p=>p.value===$('favorite-island').value),fixed=!!island?.berries;
  for(const i of [0,1,2])$(`favorite-berry-${i}`).disabled=fixed;
  $('favorite-berry-multiplier').disabled=fixed;
  for(const id of ['favorite-speed','non-favorite-speed'])$(id).disabled=island?.value!=='custom';
  $('favorite-island-help').textContent=fixed?'This island uses these three berries at 2× strength. Choose Custom / event to make changes.':island?.value.endsWith('-expert')?'Expert favorites vary each week. Enter all three berries shown in the game; choose 2.4× only for a berry-strength bonus week. Put the main favorite in the first slot. The displayed speed changes apply; other Expert bonuses are not included.':island?.value==='greengrass'?'Greengrass favorites vary each week. Choose up to three berries and the multiplier shown in your game.':'Choose up to three berries and a multiplier for your event or custom setup.';
}
function selectFavoriteIsland(){
  const id=$('favorite-island').value;
  // Custom keeps the current draft as a starting point; an island selection
  // replaces the whole draft, so Greengrass cannot retain the previous boost.
  if(id!=='custom'){
    const values=islandFavorites(id);
    for(const i of [0,1,2])$(`favorite-berry-${i}`).value=values.berries[i]||'';
    $('favorite-berry-multiplier').value=values.multiplier;
  $('favorite-speed').value=values.favoriteSpeed||0;$('non-favorite-speed').value=values.nonFavoriteSpeed||0;
  }
  $('favorite-berries-status').textContent='';updateFavoriteIslandControls();updateFavoriteChoices();
}
function updateFavoriteChoices(){
  const fields=[0,1,2].map(i=>$(`favorite-berry-${i}`)),chosen=fields.map(field=>field.value).filter(Boolean);
  for(const field of fields)for(const option of field.options)option.disabled=!!option.value&&option.value!==field.value&&chosen.includes(option.value);
}
async function applyFavoriteBerries(configuration){
  if(savingFavorites)return;
  const controls=[...$('favorite-berries-form').elements].map(field=>[field,field.disabled]);
  savingFavorites=true;for(const [field] of controls)field.disabled=true;
  try{
    const next=validateFavorites(configuration,catalog),db=await cacheDB;
    await new Promise((resolve,reject)=>{const t=db.transaction('cache','readwrite');t.objectStore('cache').put(next,'favorite-berries');t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(t.error||Error('Could not save favorite berries.'))});
    favoriteBerryConfig=next;renderCollection();$('favorite-berries-dialog').close();
    toast(next===null?'Using each Pokémon’s saved berry settings.':'Favorite berry settings applied.');
  }catch(error){$('favorite-berries-status').textContent=error.message||'Could not save favorite berries. Try again.'}
  finally{savingFavorites=false;for(const [field,disabled] of controls)field.disabled=disabled}
}
$('favorite-berries-button').onclick=openFavoriteBerries;
$('favorite-island').onchange=selectFavoriteIsland;
$('favorite-berry-fields').onchange=updateFavoriteChoices;
$('favorite-berries-form').onsubmit=event=>{
  event.preventDefault();
  const berries=[0,1,2].map(i=>$(`favorite-berry-${i}`).value),favoriteSpeed=Number($('favorite-speed').value),nonFavoriteSpeed=Number($('non-favorite-speed').value);
  if(favoriteSpeed&&!berries[0]&&berries.some(Boolean)){$('favorite-berries-status').textContent='Choose the main favorite in the first berry slot before applying a speed bonus.';return}
  void applyFavoriteBerries({berries:berries.filter(Boolean),multiplier:Number($('favorite-berry-multiplier').value),island:$('favorite-island').value,favoriteSpeed,nonFavoriteSpeed});
};
$('reset-favorite-berries').onclick=()=>void applyFavoriteBerries(null);
$('favorite-berries-dialog').oncancel=event=>{if(savingFavorites)event.preventDefault()};
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
$('level-override').onchange=event=>setLevelOverride(event.target.value);
$('reset-level-override').onclick=()=>setLevelOverride('');
function openHelp(){if(!catalog){toast('Connect to load the notebook.');return}$('method').showModal()}
$('method-button').onclick=openHelp;
$('about-button').onclick=()=>{closeActions(true);openHelp()};
$('export-button').onclick=async()=>{closeActions(true);try{const data=await api('/api/backup');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`sleep-atlas-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exported.')}catch(e){toast(e.message)}};
$('restore-file').onchange=async event=>{const f=event.target.files[0];if(!f)return;try{if(f.size>140*1024*1024)throw new Error('Backup exceeds 140 MB.');const body=JSON.parse(await f.text());const result=await api('/api/restore',{method:'POST',body:JSON.stringify(body)});await refresh();toast(`Import complete: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged.${result.skipped?` ${result.skipped} incompatible or ambiguous entries skipped.`:''}`)}catch(e){toast(e.message)}finally{event.target.value=''}};
window.addEventListener('online',()=>{if(!catalog)boot()});
window.addEventListener('focus',()=>{if(catalog&&online)refresh().catch(e=>toast(e.message))});
let updateRegistration,registrationTask;
const offlineDownload=setupOffline({closeMenu:closeActions,getRegistration:()=>registrationTask||updateRegistration});
if('serviceWorker' in navigator && window.isSecureContext){
  let hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(hadController){
      if(!$('editor').open&&!$('screenshots').disabled&&!saving&&!offlineDownload.isBusy())location.reload();
      else{$('update-button').textContent='Reload update';toast('An app update is ready. Finish this review, then select Reload update.')}
    }
    hadController=true;
  });
  registrationTask=navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>{updateRegistration=r;return r});
  // Keep the rejection observable to the offline dialog, while allowing Retry
  // to start a fresh registration instead of reusing a rejected promise.
  registrationTask.catch(()=>{}).finally(()=>{registrationTask=null});
}
$('update-button').onclick=async()=>{
  if($('screenshots').disabled||saving||offlineDownload.isBusy()){toast('Finish the current import, save, or offline download, then check for updates.');return}
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
