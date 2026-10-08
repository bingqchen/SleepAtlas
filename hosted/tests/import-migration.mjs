import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {isGroupedEntry,importReceipt,separateGroupedEntries} from '../dist/import-batch.js';
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const repair=app.slice(app.indexOf('async function repairGroupedImport(){'),app.indexOf('async function continueBatch(){'));
const originals=[new File(['one'],'one.jpg',{type:'image/jpeg'}),new File(['two'],'two.jpg',{type:'image/jpeg'})];
function fixture({failure=false,missing=false,committed=false}={}){
  const batch={id:crypto.randomUUID(),entries:[{id:crypto.randomUUID(),status:'review',files:[],names:originals.map(f=>f.name),pictureIds:originals.map(()=>crypto.randomUUID()),result:{fields:{level:52}},draft:{build:{nickname:'Unassigned edits'}}}]};
  const rows=committed?[{id:'saved',importReceipts:[{token:batch.entries[0].id,deduplicated:0}]}]:[];
  const calls=[],ctx=vm.createContext({structuredClone,Blob,File,isGroupedEntry,importReceipt,separateGroupedEntries,batch,rows,
    setUploadBusy:v=>calls.push(['busy',v]),refresh:async()=>calls.push('refresh'),
    readPictures:async ids=>{calls.push('pictures');return ids.map((id,i)=>missing&&i===1?null:{id,blob:originals[i],mime:'image/jpeg',filename:originals[i].name})},
    persistImportBatch:async value=>{calls.push(['persist',structuredClone(value)]);if(failure)throw Error('Quota')},
    toast:message=>calls.push(['toast',message]),renderBatchStatus:()=>calls.push('render')});
  vm.runInContext('let importBatch=batch,records=rows;'+repair,ctx);
  return {batch,calls,run:()=>vm.runInContext('repairGroupedImport()',ctx),current:()=>vm.runInContext('importBatch',ctx)};
}
const success=fixture();await success.run();assert.equal(success.current().entries.length,2);assert.equal(success.current().entries[0].files[0].name,'one.jpg');
assert.equal(success.current().entries[1].files[0].name,'two.jpg');assert.equal(success.current().entries[0].result,undefined);
assert.equal(success.calls[1],'refresh');assert.equal(success.calls[2],'pictures');assert.equal(success.calls[3][0],'persist');
assert.equal(success.batch.entries.length,1,'Original queue remains intact until the replacement is persisted');
const failed=fixture({failure:true});await assert.rejects(failed.run(),/Quota/);assert.equal(failed.current(),failed.batch);assert.deepEqual(failed.calls.at(-1),['busy',false]);
const missing=fixture({missing:true});await assert.rejects(missing.run(),/missing/);assert.equal(missing.current(),missing.batch);assert.ok(!missing.calls.some(c=>c[0]==='persist'));
const committed=fixture({committed:true});await committed.run();assert.equal(committed.current().entries[0].status,'saved');assert.ok(!committed.calls.includes('pictures'));
console.log('Passed: grouped review repair, blob recovery, committed receipt reconciliation, persistence ordering and quota/missing-file recovery.');
