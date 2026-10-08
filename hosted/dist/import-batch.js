export const MAX_BATCH_PHOTOS=20;
export function newImportBatch(files){
  if(!files.length||files.length>MAX_BATCH_PHOTOS)throw Error(`Choose up to ${MAX_BATCH_PHOTOS} photos.`);
  if(files.some(f=>f.size>12*1024*1024))throw Error('Each image must be smaller than 12 MB.');
  if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)))throw Error('Use PNG, JPG or WebP screenshots.');
  return {id:crypto.randomUUID(),createdAt:new Date().toISOString(),entries:files.map(file=>({id:crypto.randomUUID(),names:[file.name],pictureIds:[crypto.randomUUID()],files:[file],status:'pending'}))};
}
export const isGroupedEntry=entry=>!['saved','skipped'].includes(entry.status)&&Math.max(entry.files?.length||0,entry.pictureIds?.length||0,entry.result?.imageIds?.length||0,entry.names?.length||0)>1;
export function importReceipt(entry,rows){
  for(const row of rows){const receipt=row.importReceipts?.find(r=>r.token===entry.id);if(receipt)return {id:row.id,deduplicated:receipt.deduplicated,alreadySaved:true}}
  return null;
}
// Repair v39 queues without reusing the combined readings or copying one
// Pokémon's manual corrections onto every image. The caller persists before OCR.
export function separateGroupedEntries(batch,rows=[]){
  if(!batch.entries.some(isGroupedEntry))return batch;
  const next=structuredClone(batch);next.previousGroupedDrafts||=[];
  next.entries=next.entries.flatMap(entry=>{
    if(!isGroupedEntry(entry))return [entry];
    const receipt=importReceipt(entry,rows);
    if(receipt)return [{...entry,status:'saved',receipt,files:[],result:undefined,draft:undefined}];
    const count=Math.max(entry.files?.length||0,entry.pictureIds?.length||0,entry.result?.imageIds?.length||0,entry.names?.length||0);
    if(entry.files?.length!==count||entry.files.some(file=>!(file instanceof Blob)))throw Error('Some photos in this unfinished import are missing. Reopen the app with device storage available and try again.');
    if(entry.draft)next.previousGroupedDrafts.push({id:entry.id,names:entry.names,draft:entry.draft});
    return entry.files.map((file,i)=>({id:crypto.randomUUID(),names:[entry.names?.[i]||file.name||`Photo ${i+1}`],pictureIds:[entry.result?.imageIds?.[i]||entry.pictureIds?.[i]||crypto.randomUUID()],files:[file],status:'pending'}));
  });
  return next;
}
export const batchSummary=batch=>({saved:batch.entries.filter(e=>e.status==='saved').length,updated:batch.entries.filter(e=>e.status==='saved'&&e.receipt?.deduplicated).length,review:batch.entries.filter(e=>e.status==='review').length,pending:batch.entries.filter(e=>['pending','recognized'].includes(e.status)).length,skipped:batch.entries.filter(e=>e.status==='skipped').length,total:batch.entries.length});
export async function runImportBatch(batch,{read,save,persist,progress=()=>{}}){
  if(batch.entries.some(isGroupedEntry))throw Error('This unfinished import contains grouped photos. Resume it to separate them before reading.');
  for(const [index,entry] of batch.entries.entries()){
    if(!['pending','recognized'].includes(entry.status))continue;
    const report=message=>progress(`Photo ${index+1} of ${batch.entries.length} · ${message}`);
    if(entry.status==='pending'){
      try{entry.result=await read(entry.files,report,entry);entry.status='recognized'}
      catch(error){entry.result={fields:{},warnings:[],review:{ready:false,reasons:[error.message||'Could not read this photo.']}};entry.status='review'}
      await persist(batch);
    }
    if(entry.status!=='recognized')continue;
    if(!entry.result.review?.ready){entry.status='review';await persist(batch);continue}
    report('Saving identified Pokémon…');
    try{
      // Stable token makes retrying a committed save safe after a reload or
      // failed queue write. Keep raw fields so missing nicknames stay missing.
      entry.receipt=await save(entry.result.fields,entry.result.imageIds||[],entry.id);
      entry.status='saved';entry.files=[];delete entry.result;
    }catch(error){entry.status='review';entry.result.review={ready:false,reasons:[`Could not save: ${error.message}`]}}
    await persist(batch);
  }
  return batchSummary(batch);
}
