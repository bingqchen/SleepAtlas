import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {detailNeighbors,attachDetailSwipes} from '../dist/detail-navigation.js';
import {collectionRows} from '../dist/collection.js';

const species=[{name:'a',displayName:'Abra',specialty:'skill'},{name:'b',displayName:'Arbok',specialty:'berry'},{name:'c',displayName:'Ampharos',specialty:'skill'}];
const records=species.map((p,i)=>({id:p.name,analysis:{build:{species:p.name,nickname:p.displayName,level:10+i},current:{strength:i}}}));
const ids=collectionRows(records,species,{prefix:'A',specialty:'skill',sort:'strength'}).map(r=>r.id);
assert.deepEqual(ids,['c','a']);
assert.deepEqual(detailNeighbors(ids,'c'),{index:0,total:2,previous:null,next:'a'});
assert.deepEqual(detailNeighbors(ids,'a'),{index:1,total:2,previous:'c',next:null});
assert.deepEqual(detailNeighbors(ids,'b'),{index:-1,total:2,previous:null,next:null});
assert.equal(detailNeighbors(['a'],'a').next,null);assert.equal(detailNeighbors([],null).previous,null);

const listeners=new Map(),directions=[];
const element={ownerDocument:{documentElement:{clientWidth:390}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
let enabled=true,selected=false;
const detach=attachDetailSwipes(element,{enabled:()=>enabled,navigate:d=>directions.push(d),hasSelection:()=>selected});
const content={closest:()=>null};
let prevented=0,stopped=0;
const touch=(x,y,id=1)=>({clientX:x,clientY:y,identifier:id});
const fire=(name,touches,changedTouches=[],timeStamp=100,target=content,cancelable=true)=>listeners.get(name)?.({touches,changedTouches,timeStamp,target,cancelable,preventDefault:()=>prevented++,stopPropagation:()=>stopped++});
function swipe(x1,y1,x2,y2,{duration=300,target=content,cancelable=true}={}){
 fire('touchstart',[touch(x1,y1)],[],100,target);
 fire('touchmove',[touch(x2,y2)],[],100+duration/2,target,cancelable);
 fire('touchend',[],[touch(x2,y2)],100+duration,target);
}
swipe(300,200,100,210);assert.deepEqual(directions,[1]);assert.ok(prevented>0);
fire('click',[],[],450);assert.equal(stopped,1,'A swipe must not also click the new Pokémon');
const freshButton={closest:s=>s.includes('button')?{}:null};
fire('touchstart',[touch(100,100)],[],460,freshButton);fire('click',[],[],480,freshButton);
assert.equal(stopped,1,'A fresh deliberate button tap after a swipe must work immediately');
fire('click',[],[],1000);assert.equal(stopped,1);
swipe(80,200,260,205);assert.deepEqual(directions,[1,-1]);
const count=directions.length;
swipe(200,200,210,350); // vertical scroll
swipe(200,200,175,201); // short drag
swipe(200,200,100,100); // diagonal
swipe(200,200,80,200,{duration:1200}); // long hold
swipe(5,200,150,200); // native edge gesture
swipe(200,200,80,200,{cancelable:false}); // browser took gesture
const control={closest:s=>s.includes('button')?{}:null};swipe(200,200,80,200,{target:control});
const table={closest:s=>s==='.table-wrap,pre'?{scrollWidth:800,clientWidth:330}:null};
const beforeTable=prevented;swipe(200,200,80,200,{target:table});assert.equal(prevented,beforeTable,'Horizontal table scrolling must stay native');
enabled=false;swipe(200,200,80,200);enabled=true;
selected=true;swipe(200,200,80,200);selected=false;
fire('touchstart',[touch(200,200)]);fire('touchmove',[touch(100,200),touch(110,210,2)]);fire('touchend',[],[touch(80,200)],300);
fire('touchstart',[touch(200,200)]);fire('touchcancel',[]);fire('touchend',[],[touch(80,200)],300);
fire('touchstart',[touch(200,200)]);fire('touchmove',[touch(200,230)]);fire('touchend',[],[touch(80,240)],300);
assert.equal(directions.length,count,'Rejected gestures must not navigate');
detach();assert.equal(listeners.size,0);

// Exercise the real async details function: a late read cannot reopen a dialog
// after Close/Edit/Delete, and an obsolete failure cannot change a new request.
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const closing=source.slice(source.indexOf('function closeDetails(){'),source.indexOf('function detailNavigation(){'));
const showing=source.slice(source.indexOf('async function showDetails('),source.indexOf('async function showExample('));
const pending=[],messages=[];let modalCalls=0;
const dialog={open:true,close(){this.open=false},showModal(){modalCalls++;this.open=true}};
const body={innerHTML:'original',setAttribute(){},removeAttribute(){}};
const context=vm.createContext({$:id=>id==='details'?dialog:body,updateDetailButtons(){},online:true,api:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),toast:m=>messages.push(m)});
vm.runInContext('let detailRequest=0,detailLoading=false,detailId="original",detailOrder=["original","next"];'+closing+showing,context);
const late=vm.runInContext('showDetails("next",undefined,true)',context);
vm.runInContext('closeDetails()',context);pending.shift().resolve({id:'next'});await late;
assert.equal(modalCalls,0);assert.equal(body.innerHTML,'original');assert.equal(dialog.open,false);
const first=vm.runInContext('showDetails("one")',context),second=vm.runInContext('showDetails("two")',context);
pending.shift().reject(Error('stale failure'));await first;assert.deepEqual(messages,[]);assert.equal(vm.runInContext('detailLoading',context),true);
pending.shift().reject(Error('current failure'));await second;assert.deepEqual(messages,['current failure']);assert.equal(vm.runInContext('detailLoading',context),false);
console.log('Passed: filtered/sorted order, boundaries, missing/single records, left/right gestures, scroll/controls/selection/pinch protection, click suppression, cleanup and late async responses.');
