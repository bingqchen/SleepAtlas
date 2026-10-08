export const MAX_BATCH_PHOTOS=20;
export function newImportBatch(files,mode='batch'){
  if(!files.length||files.length>MAX_BATCH_PHOTOS)throw Error(`Choose up to ${MAX_BATCH_PHOTOS} photos.`);
  if(mode==='single'&&files.length>8)throw Error('Choose up to 8 photos for one Pokémon.');
  if(files.some(f=>f.size>12*1024*1024))throw Error('Each image must be smaller than 12 MB.');
  if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)))throw Error('Use PNG, JPG or WebP screenshots.');
  return {id:crypto.randomUUID(),createdAt:new Date().toISOString(),entries:(mode==='single'?[files]:files.map(f=>[f])).map(group=>({id:crypto.randomUUID(),names:group.map(f=>f.name),pictureIds:group.map(()=>crypto.randomUUID()),files:group,status:'pending'}))};
}
export const batchSummary=batch=>({saved:batch.entries.filter(e=>e.status==='saved').length,updated:batch.entries.filter(e=>e.status==='saved'&&e.receipt?.deduplicated).length,review:batch.entries.filter(e=>e.status==='review').length,pending:batch.entries.filter(e=>['pending','recognized'].includes(e.status)).length,skipped:batch.entries.filter(e=>e.status==='skipped').length,total:batch.entries.length});
export async function runImportBatch(batch,{read,save,persist,progress=()=>{}}){
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
