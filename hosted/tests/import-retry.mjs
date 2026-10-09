import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const retry=app.slice(app.indexOf('async function retryImportPhoto('),app.indexOf('async function pauseBatchReview(){'));
function setup({readFailure=false,persistFailure=0,files=true,draft=false,changed=true}={}){
  const entry={id:'entry',status:'review',files:files?[new Blob(['photo'])]:[],pictureIds:['original'],result:{fields:{level:61}},...(draft?{draft:{build:{nickname:'Old draft'}}}:{})};
  const batch={id:'batch',entries:[entry]},calls=[],controls=[{disabled:false},{disabled:true}],status={textContent:''};let writes=0,durable;
  const ctx=vm.createContext({structuredClone,clearTimeout:()=>{},saveDraft:{},
    editorSnapshot:()=>changed?'new typed values':'old values',createScreenshotReader:()=>({read:async(files,progress,ids)=>{calls.push(['read',ids]);progress('Reading');if(readFailure)throw Error('Read failed');return {fields:{species:'BLISSEY'},review:{ready:true,reasons:[]}}},close:async()=>calls.push('reader closed')}),
    $:id=>id==='pokemon-form'?{elements:controls}:id==='reread-photo-dialog'?{showModal:()=>calls.push('confirmation shown'),close:()=>calls.push('confirmation closed')}:status,setUploadBusy:v=>calls.push(['busy',v]),
    rememberBatchDraft:()=>{calls.push('snapshot');entry.draft={build:{nickname:'Newest typed value'}}},
    persistImportBatch:async value=>{calls.push('persist');writes++;if(writes===persistFailure)throw Error('Storage full');durable=structuredClone(value||batch)},
    closeBatchEditor:()=>calls.push('close'),continueBatch:async()=>calls.push('continue')});
  ctx.batch=batch;
  vm.runInContext("let saving=false,uploading=false,closingEditor=false,reviewEntryId='entry',editorBaseline='old values',importBatch=batch;"+retry,ctx);
  return {entry,calls,controls,status,run:(confirmed=true)=>vm.runInContext('retryImportPhoto({confirmed:'+confirmed+'})',ctx),current:()=>vm.runInContext('importBatch',ctx),durable:()=>durable};
}
const good=setup({draft:true});await good.run();
assert.deepEqual(good.calls.slice(0,4),[['busy',true],'snapshot','persist',['read',['original']]]);
assert.equal(good.current().entries[0].id,'entry');assert.deepEqual(good.current().entries[0].pictureIds,['original']);
assert.equal(good.current().entries[0].status,'review','Retry fills the review; it does not silently commit a Pokémon');
assert.equal(good.current().entries[0].result.fields.species,'BLISSEY');assert.equal(good.current().entries[0].draft,undefined);
assert.ok(good.calls.includes('continue'));assert.deepEqual(good.controls.map(c=>c.disabled),[false,true]);
const cancelled=setup();await cancelled.run(false);assert.deepEqual(cancelled.calls,['confirmation shown'],'No OCR or mutation until confirmation');
const clean=setup({changed:false});await clean.run(false);assert.ok(!clean.calls.includes('confirmation shown'),'No extra confirmation for an untouched reading');
const previousDraft=setup({draft:true,changed:false});await previousDraft.run(false);assert.deepEqual(previousDraft.calls,['confirmation shown'],'Existing corrections require confirmation after reload');
for(const options of [{readFailure:true},{persistFailure:2}]){
  const failed=setup(options);await failed.run();
  assert.equal(failed.current().entries[0].result.fields.level,61);
  assert.equal(failed.durable().entries[0].draft.build.nickname,'Newest typed value','Newest edits survive a read or replacement-write failure');
  assert.ok(!failed.calls.includes('close'));assert.match(failed.status.textContent,/Could not reread/);
  assert.deepEqual(failed.controls.map(c=>c.disabled),[false,true]);
}
const noStorage=setup({persistFailure:1});await noStorage.run();assert.ok(!noStorage.calls.some(c=>c[0]==='read'),'Do not start OCR before preserving current edits');
const missing=setup({files:false});await missing.run();assert.match(missing.status.textContent,/original photo is unavailable/);assert.deepEqual(missing.calls,[]);
console.log('Passed: explicit photo retry, stable identity, confirm/cancel, draft durability before OCR, missing files, read/storage failures and control restoration.');
