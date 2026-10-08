import {Engine,MODEL_VERSION} from './engine.js';
import {matchesProgression,compatibleImport} from './build-identity.js';
import {withRecordedFrequency} from './pokemon-stats.js';
import {speciesChoices} from './evolution.js';
let ready,dbPromise;
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const complete=t=>new Promise((resolve,reject)=>{t.oncomplete=()=>resolve();t.onabort=t.onerror=()=>reject(t.error||Error('Could not save to this device. Export a backup and check available storage.'))});
export function database(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('sleep-atlas-collection',1);r.onupgradeneeded=()=>{r.result.createObjectStore('pokemon',{keyPath:'id'});r.result.createObjectStore('screenshots',{keyPath:'id'})};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();dbPromise=null};resolve(r.result)};r.onerror=()=>{dbPromise=null;reject(Error('Device storage is unavailable. Open a regular browser window and try again.'))}});
  return dbPromise;
}
export async function initialize(){if(!ready)ready=fetch('/catalog.json').then(r=>{if(!r.ok)throw Error('Could not load the Pokémon catalog. Connect to the internet and reload.');return r.json()}).then(c=>({catalog:c,engine:new Engine(c)})).catch(e=>{ready=null;throw e});return ready}
async function all(store){const db=await database();return request(db.transaction(store).objectStore(store).getAll())}
async function get(store,id){const db=await database();return request(db.transaction(store).objectStore(store).get(id))}
const refreshedAnalyses=new Map();
export function projectAnalysis(analysis,catalog,engine=new Engine(catalog)){
  if(analysis.modelVersion===MODEL_VERSION&&analysis.catalogCommit===catalog.commit)return analysis;
  const build=engine.validate(analysis.build),key=JSON.stringify([MODEL_VERSION,catalog.commit,build]);
  if(!refreshedAnalyses.has(key)){
    refreshedAnalyses.set(key,engine.analyze(build));
    if(refreshedAnalyses.size>1000)refreshedAnalyses.delete(refreshedAnalyses.keys().next().value);
  }
  return structuredClone(refreshedAnalyses.get(key));
}
// Recompute derived output without rewriting the original build or its history.
const summary=(row,catalog,engine)=>{const {history,...view}=row;return {...view,analysis:projectAnalysis({...row.analysis,build:withRecordedFrequency(row.analysis.build,row.screenshots,catalog)},catalog,engine)}};
const validId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const pictureTypes=['image/png','image/jpeg','image/webp','image/heic','image/heif'];
function decodePicture(pic){
  if(!pic||!pictureTypes.includes(pic.mime)||typeof pic.data!=='string'||pic.data.length>16*1024*1024)throw Error('Invalid or oversized screenshot in backup.');
  let bytes;try{const data=atob(pic.data);bytes=Uint8Array.from(data,c=>c.charCodeAt(0))}catch{throw Error('Invalid screenshot data in backup.')}
  if(!bytes.length||bytes.length>12*1024*1024)throw Error('Invalid screenshot size.');
  if(pic.ocr?.lines&&!Array.isArray(pic.ocr.lines))throw Error('Invalid screenshot text.');
  return {id:crypto.randomUUID(),filename:String(pic.filename||'screenshot').slice(0,200),mime:pic.mime,blob:new Blob([bytes],{type:pic.mime}),text:(pic.ocr?.lines||[]).map(l=>({text:String(l.text??''),x:Number(l.x)||0,y:Number(l.y)||0,confidence:Number(l.confidence)||0})),createdAt:new Date().toISOString()};
}
export async function savePictures(pictures){
  const db=await database(),t=db.transaction('screenshots','readwrite'),done=complete(t),store=t.objectStore('screenshots');
  // Discard abandoned imports older than a day; saved screenshots stay attached.
  const cursor=store.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(!c.value.owner&&!c.value.pendingReview&&Date.now()-Date.parse(c.value.createdAt)>86400000)c.delete();c.continue()}};
  for(const pic of pictures){const r=store.get(pic.id);r.onsuccess=()=>{if(!r.result)store.add(pic)}}await done;return pictures.map(p=>p.id);
}
export async function discardPictures(ids){
  const db=await database(),t=db.transaction('screenshots','readwrite'),done=complete(t),store=t.objectStore('screenshots');
  for(const id of ids){const r=store.get(id);r.onsuccess=()=>{if(r.result&&!r.result.owner)store.delete(id)}}await done;
}
export async function api(path,options={}){
  const {catalog,engine}=await initialize(),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
  if(path==='/api/catalog')return catalog;
  if(path==='/api/pokemon'&&method==='GET')return (await all('pokemon')).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(row=>summary(row,catalog,engine));
  if(path==='/api/analyze'&&method==='POST'){await new Promise(r=>setTimeout(r,0));return engine.analyze(body.build)}
  if(path==='/api/pokemon'&&method==='POST'){
    if(body.id&&!validId(body.id))throw Error('Invalid Pokémon ID.');
    if(body.importToken&&!validId(body.importToken))throw Error('Invalid import token.');
    const ids=body.imageIds||[];if(!Array.isArray(ids)||ids.length>8||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)throw Error('Invalid screenshot references.');
    await new Promise(r=>setTimeout(r,0));const analysis=engine.analyze(body.build),db=await database();
    // Match and write inside one transaction so simultaneous imports in two tabs
    // cannot both create a new record for the same build.
    const t=db.transaction(['pokemon','screenshots'],'readwrite'),done=complete(t),store=t.objectStore('pokemon'),pictureStore=t.objectStore('screenshots');
    let result,failure;
    const abort=message=>{failure=message;t.abort()};
    const previous=store.getAll();previous.onsuccess=()=>{
      const rows=previous.result,explicit=body.id?rows.find(row=>row.id===body.id):null;
      const receipt=body.importToken&&rows.flatMap(row=>(row.importReceipts||[]).map(r=>({...r,id:row.id}))).find(r=>r.token===body.importToken);
      if(receipt){result={id:receipt.id,deduplicated:receipt.deduplicated,alreadySaved:true};return}
      if(body.id&&!explicit){abort('This Pokémon no longer exists.');return}
      if(explicit&&!speciesChoices(catalog,explicit.analysis.build.species).some(p=>p.name===analysis.build.species)){abort('Choose a species in this Pokémon’s evolution family. Add an unrelated Pokémon as a new entry.');return}
      const matches=body.id?[explicit]:rows.filter(row=>matchesProgression(row.analysis.build,analysis.build,catalog));
      matches.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
      const old=matches[0],id=body.id||old?.id||crypto.randomUUID(),owners=new Set(matches.map(row=>row.id));
      const pictures=new Array(ids.length);let pending=ids.length;
      const commit=()=>{
        if(pictures.some(p=>!p||(p.owner&&!owners.has(p.owner)))){abort('A screenshot is missing or belongs to another Pokémon. Please import it again.');return}
        // A fresh OCR import often has no nickname or notes. Keep those from the
        // matching helper unless the new entry supplies replacements.
        if(old&&!body.id){if(!body.build.nickname?.trim())analysis.build.nickname=old.analysis.build.nickname;if(!body.build.notes?.trim())analysis.build.notes=old.analysis.build.notes||''}
        const now=new Date().toISOString();
        const history=matches.flatMap(row=>row.history?.length?row.history:[{createdAt:row.updatedAt,analysis:row.analysis}]).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
        history.push({createdAt:now,analysis});
        const metadata=!ids.length&&!body.id&&old?old.screenshots||[]:pictures.map(p=>({id:p.id,filename:p.filename,text:p.text}));
        const kept=new Set(metadata.map(p=>p.id));
        for(const row of matches){for(const pic of row.screenshots||[])if(!kept.has(pic.id))pictureStore.delete(pic.id);if(row.id!==id)store.delete(row.id)}
        const importReceipts=matches.flatMap(row=>row.importReceipts||[]);
        if(body.importToken)importReceipts.push({token:body.importToken,deduplicated:body.id?0:matches.length});
        store.put({id,createdAt:old?.createdAt||now,updatedAt:now,analysis,history,historyCount:history.length,screenshots:metadata,importReceipts});
        for(const p of pictures)pictureStore.put({...p,owner:id,pendingReview:false});
        result={id,deduplicated:body.id?0:matches.length};
      };
      if(!pending)commit();
      else ids.forEach((imageId,index)=>{const r=pictureStore.get(imageId);r.onsuccess=()=>{pictures[index]=r.result;if(!--pending)commit()}});
    };
    try{await done}catch(e){if(failure)throw Error(failure);throw e}
    navigator.storage?.persist?.().catch(()=>{});return result;
  }
  if(path.startsWith('/api/pokemon/')){
    const id=decodeURIComponent(path.slice('/api/pokemon/'.length));if(!validId(id))throw Error('Invalid Pokémon ID.');
    if(method==='GET'){const row=await get('pokemon',id);if(!row)throw Error('This Pokémon no longer exists.');return summary(row,catalog,engine)}
    if(method==='DELETE'){const db=await database(),t=db.transaction(['pokemon','screenshots'],'readwrite'),done=complete(t),store=t.objectStore('pokemon'),r=store.get(id);r.onsuccess=()=>{for(const p of r.result?.screenshots||[])t.objectStore('screenshots').delete(p.id);store.delete(id)};await done;return {deleted:true}}
  }
  if(path==='/api/backup'){
    // Export builds only; original screenshots and OCR stay in device storage.
    const pokemon=(await all('pokemon')).map(row=>({id:row.id,build:withRecordedFrequency(row.analysis.build,row.screenshots,catalog)}));
    return {format:'sleep-atlas',version:1,exportedAt:new Date().toISOString(),pokemon};
  }
  if(path==='/api/restore'&&method==='POST'){
    if(body.format!=='sleep-atlas'||body.version!==1||!Array.isArray(body.pokemon)||body.pokemon.length>1000)throw Error('Not a valid Sleep Atlas version 1 backup (maximum 1,000 Pokémon).');
    const prepared=[],seen=new Set();
    for(const row of body.pokemon){
      if(!row||!validId(row.id)||seen.has(row.id.toLowerCase()))throw Error('Invalid or duplicate Pokémon IDs in backup.');seen.add(row.id.toLowerCase());
      const screenshots=row.screenshots||[];if(!Array.isArray(screenshots)||screenshots.length>8)throw Error('Invalid screenshots in backup.');
      const analysis=engine.analyze(row.build),pics=screenshots.map(decodePicture);
      for(const [i,pic] of pics.entries()){
        const bytes=new TextEncoder().encode(JSON.stringify([pic.filename,pic.mime,pic.text,screenshots[i].data]));
        pic.fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
      }
      prepared.push({id:row.id.toLowerCase(),analysis,pics});
      await new Promise(r=>setTimeout(r,0));
    }
    const db=await database(),t=db.transaction(['pokemon','screenshots'],'readwrite'),done=complete(t),store=t.objectStore('pokemon'),pictures=t.objectStore('screenshots');
    const result={added:0,updated:0,unchanged:0,skipped:0};let failure;
    // Read and match inside the write transaction so simultaneous restores
    // cannot make decisions against an outdated collection.
    const existing=store.getAll();existing.onsuccess=()=>{try{
      const rows=new Map(existing.result.map(row=>[row.id,row]));
      const reserved=new Set(prepared.filter(incoming=>rows.has(incoming.id)).map(incoming=>incoming.id));
      const plans=[];
      for(const incoming of prepared){
        let old=rows.get(incoming.id);const exact=!!old;
        if(old){
          // An incompatible explicit ID must never target a different helper.
          if(!compatibleImport(old.analysis.build,incoming.analysis.build,catalog,{sameId:true})){result.skipped++;continue}
        }else{
          const matches=[...rows.values()].filter(row=>compatibleImport(row.analysis.build,incoming.analysis.build,catalog));
          if(matches.length>1){result.skipped++;continue}
          old=matches[0];
          // Explicit IDs retain priority even when their imported build conflicts.
          if(old&&reserved.has(old.id)){result.skipped++;continue}
        }
        plans.push({incoming,old,exact});
      }
      // Match against the pre-import snapshot. Two new helpers in one backup
      // remain distinct; competing updates cannot depend on file order.
      const targets=new Map();
      for(const plan of plans)if(plan.old){const group=targets.get(plan.old.id)||[];group.push(plan);targets.set(plan.old.id,group)}
      for(const {incoming,old,exact} of plans){
        const group=old&&targets.get(old.id);
        if(group?.length>1&&!exact){result.skipped++;continue}
        const sameAnalysis=old&&JSON.stringify(old.analysis.build)===JSON.stringify(incoming.analysis.build)&&old.analysis.modelVersion===incoming.analysis.modelVersion&&old.analysis.catalogCommit===incoming.analysis.catalogCommit;
        const samePictures=!incoming.pics.length||(incoming.pics.length===old?.screenshots?.length&&incoming.pics.every((pic,i)=>pic.fingerprint===old.screenshots[i].fingerprint));
        if(sameAnalysis&&samePictures){result.unchanged++;continue}
        const id=old?.id||incoming.id,now=new Date().toISOString();
        const history=old?(old.history?.length?[...old.history]:[{createdAt:old.updatedAt,analysis:old.analysis}]):[];
        if(!sameAnalysis)history.push({createdAt:now,analysis:incoming.analysis});
        // Image-free backups retain local evidence. Legacy embedded pictures
        // replace only the matched helper's pictures in this same transaction.
        const screenshots=!samePictures?incoming.pics.map(p=>({id:p.id,filename:p.filename,text:p.text,fingerprint:p.fingerprint})):old?.screenshots||[];
        if(!samePictures){for(const pic of old?.screenshots||[])pictures.delete(pic.id);for(const pic of incoming.pics)pictures.add({...pic,owner:id})}
        const row={id,createdAt:old?.createdAt||now,updatedAt:now,analysis:incoming.analysis,history,historyCount:history.length,screenshots,importReceipts:old?.importReceipts||[]};
        store.put(row);result[old?'updated':'added']++;
      }
    }catch(error){failure=error;t.abort()}};
    try{await done}catch(error){throw failure||error}
    return result;
  }
  throw Error('This action is unavailable.');
}
