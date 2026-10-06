import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('async function deleteEditedPokemon(){'),app.indexOf("$('delete-pokemon').onclick="));
function fixture({confirmed=true,dirty=false,draft={id:'saved'},failure=false,renderFailure=false}={}){
  const calls=[],prompts=[],messages=[],controls=[{disabled:false},{disabled:true}];
  const nodes={editor:{open:true,close(){this.open=false}},'pokemon-form':{elements:controls},'form-status':{textContent:''},'upload-status':{textContent:'Resume draft'},'resume-draft':{}};
  const state={draft,records:null};
  const saveDraft=()=>calls.push('saveDraft');
  const ctx=vm.createContext({$:id=>nodes[id],clearTimeout(){},saveDraft,hasUnsavedChanges:()=>dirty,
    confirm:message=>{prompts.push(message);return confirmed},toast:message=>messages.push(message),
    URL:{revokeObjectURL:url=>calls.push(['revoke',url])},
    api:async(path,options)=>{calls.push([path,options.method]);assert.ok(controls.every(c=>c.disabled));if(failure)throw Error('Storage write failed')},
    clearEditorDraft:async()=>{if(dirty)state.draft=null},cacheGet:async key=>state[key],cachePut:async(key,value)=>{state[key]=value},
    renderCollection:()=>{calls.push('render');if(renderFailure)throw Error('Render failed')}
  });
  vm.runInContext('let editing="saved",demo=false,online=true,saving=false,closingEditor=false,pendingEntry=true,editorBaseline="baseline",imageIds=["image"],pictureURLs=["blob:test"],records=[{id:"saved",analysis:{build:{nickname:"Gardevoir"}}},{id:"other"}];'+source,ctx);
  return {ctx,calls,prompts,messages,controls,nodes,state,run:()=>vm.runInContext('deleteEditedPokemon()',ctx)};
}

const canceled=fixture({confirmed:false,dirty:true});await canceled.run();
assert.equal(canceled.calls.length,0);assert.equal(canceled.nodes.editor.open,true);assert.equal(canceled.state.draft.id,'saved');
assert.match(canceled.prompts[0],/unsaved edits will also be discarded/);
assert.match(canceled.prompts[0],/Gardevoir/);

const failed=fixture({failure:true,dirty:true});await failed.run();
assert.equal(failed.nodes.editor.open,true);assert.equal(failed.state.draft.id,'saved');
assert.equal(vm.runInContext('records.length',failed.ctx),2);assert.equal(vm.runInContext('editing',failed.ctx),'saved');
assert.equal(failed.nodes['form-status'].textContent,'Storage write failed');assert.ok(failed.calls.includes('saveDraft'));
assert.deepEqual(failed.controls.map(c=>c.disabled),[false,true]);assert.equal(vm.runInContext('saving',failed.ctx),false);

for(const dirty of [false,true]){
  const success=fixture({dirty});await success.run();
  assert.deepEqual(success.calls[0],['/api/pokemon/saved','DELETE']);assert.equal(success.nodes.editor.open,false);
  assert.equal(success.state.draft,null);assert.equal(success.state.records.length,1);assert.equal(success.state.records[0].id,'other');
  assert.equal(vm.runInContext('editing',success.ctx),null);assert.equal(vm.runInContext('pendingEntry',success.ctx),false);
  assert.equal(vm.runInContext('pictureURLs.length+imageIds.length',success.ctx),0);assert.ok(!success.calls.includes('saveDraft'));
  assert.deepEqual(success.controls.map(c=>c.disabled),[false,true]);
}
const unrelated=fixture({draft:{id:'other',build:{notes:'Recovery draft'}}});await unrelated.run();
assert.equal(unrelated.state.draft.id,'other');assert.equal(unrelated.nodes['upload-status'].textContent,'Resume draft');

const renderFailed=fixture({renderFailure:true});await renderFailed.run();
assert.equal(renderFailed.nodes.editor.open,false);assert.ok(!renderFailed.calls.includes('saveDraft'));
assert.match(renderFailed.messages[0],/deleted.*Reload/);
for(const guard of ['editing=null','demo=true','saving=true','closingEditor=true']){
  const blocked=fixture();vm.runInContext(guard,blocked.ctx);await blocked.run();assert.equal(blocked.calls.length,0);assert.equal(blocked.prompts.length,0);
}
console.log('Passed: delete cancellation, saved ID/name, unsaved-edit warning, failure recovery, control locking, successful cleanup, unrelated draft preservation and post-delete render failure.');
