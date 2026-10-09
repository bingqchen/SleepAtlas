import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'hosted/dist'),staged=path.join(root,'native/www');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
const injection='<script src="/native-bridge.js"></script>';
const required=[
  'index.html','app.js','platform.js','local-api.js','engine.js','ocr.js','ocr-parser.js',
  'import-batch.js','catalog.json','sprite-features.json','ingredient-features.json',
  'vendor/tesseract.min.js','vendor/worker.min.js','vendor/eng.traineddata.gz',
  'vendor/tesseract-core.wasm.js','vendor/tesseract-core-simd.wasm.js',
  'vendor/tesseract-core-lstm.wasm.js','vendor/tesseract-core-simd-lstm.wasm.js',
];

async function inventory(directory){
  const result={};
  async function walk(current){
    for(const entry of await readdir(current,{withFileTypes:true})){
      const file=path.join(current,entry.name);
      assert.ok(!entry.isSymbolicLink(),`Unexpected symlink: ${file}`);
      if(entry.isDirectory())await walk(file);
      else{
        assert.ok(entry.isFile(),`Unexpected non-file: ${file}`);
        result[path.relative(directory,file).split(path.sep).join('/')]=hash(await readFile(file));
      }
    }
  }
  await walk(directory);return result;
}

try{await access(path.join(staged,'native-build.json'))}
catch{throw Error('Stage the current shared app first: pnpm native:stage (or pnpm ios:sync).')}
const config=await readJSON(path.join(root,'capacitor.config.json'));
assert.equal(config.webDir,'native/www');
assert.equal(config.ios?.path,'native/ios');
assert.equal(config.server?.hostname,'localhost','Keep the IndexedDB origin stable.');
assert.equal(config.server?.iosScheme,'capacitor','Keep the IndexedDB origin stable.');
assert.ok(!Object.hasOwn(config.server||{},'url'),'The release app must load its packaged assets, not server.url.');
assert.notEqual(config.server?.cleartext,true);

const [canonical,actual,manifest,pkg]=await Promise.all([
  inventory(source),inventory(staged),readJSON(path.join(staged,'native-build.json')),readJSON(path.join(root,'package.json')),
]);
const sourceHTML=await readFile(path.join(source,'index.html'),'utf8');
assert.ok(!sourceHTML.includes('native-bridge.js'),'The website must not load the native bridge.');
assert.ok(!Object.hasOwn(canonical,'native-bridge.js'),'The native bridge belongs only to staged assets.');
assert.equal((sourceHTML.match(/<\/head>/g)||[]).length,1);
const nativeHTML=await readFile(path.join(staged,'index.html'),'utf8');
assert.equal(hash(nativeHTML),hash(sourceHTML.replace('</head>',`${injection}</head>`)),'Only the native bridge injection may change staged HTML. Rerun pnpm native:stage.');
const expected={...canonical};
delete expected._headers;
expected['index.html']=hash(Buffer.from(nativeHTML));
expected['native-bridge.js']=actual['native-bridge.js'];
expected['licenses/capacitor-LICENSE']=hash(await readFile(path.join(root,'node_modules/@capacitor/core/LICENSE')));
assert.ok(expected['native-bridge.js'],'The native bridge must be bundled.');
const recorded={...actual};delete recorded['native-build.json'];
assert.deepEqual(Object.keys(recorded).sort(),Object.keys(expected).sort(),'Staged assets must cover shared source files with only the expected native additions.');
for(const [file,digest] of Object.entries(expected))assert.equal(recorded[file],digest,`Staged ${file} differs from shared source. Rerun pnpm native:stage.`);
assert.deepEqual(Object.keys(manifest.files).sort(),Object.keys(recorded).sort(),'The manifest must cover every staged asset.');
for(const [file,digest] of Object.entries(recorded))assert.equal(manifest.files[file],digest,`Incorrect manifest SHA-256 for ${file}.`);
assert.equal(manifest.version,pkg.version);
assert.equal(manifest.reader,sourceHTML.match(/Reader v\d+/)?.[0]);
for(const file of required){
  assert.ok(canonical[file],`Missing shared asset: ${file}`);
  assert.equal(actual[file],file==='index.html'?expected[file]:canonical[file],`Shared asset changed: ${file}`);
  assert.ok((await readFile(path.join(staged,file))).length>0,`Empty asset: ${file}`);
}
for(const file of ['vendor/tesseract-core-lstm.wasm.js','vendor/tesseract-core-simd-lstm.wasm.js']){
  assert.match(await readFile(path.join(staged,file),'utf8'),/data:application\/octet-stream;base64,AGFzb/,'The bundled OCR core must include its WASM.');
}
const bridge=await readFile(path.join(staged,'native-bridge.js'),'utf8');
for(const method of ['SleepAtlasNative','pickImages','releaseImport','shareBackup'])assert.ok(bridge.includes(method),`Missing native bridge API: ${method}`);

if(process.argv.includes('--synced')){
  const publicDir=path.join(root,'native/ios/App/App/public');
  try{await access(publicDir)}catch{throw Error('Sync the staged bundle into iOS before building: pnpm ios:sync.')}
  const copied=await inventory(publicDir);
  for(const [file,digest] of Object.entries(actual))assert.equal(copied[file],digest,`The iOS copy is stale (${file}). Run pnpm ios:sync.`);
  // Capacitor adds these empty compatibility files during copy.
  for(const file of Object.keys(copied))assert.ok(Object.hasOwn(actual,file)||['cordova.js','cordova_plugins.js'].includes(file),`Unexpected file in iOS public assets: ${file}`);
  const copiedConfig=await readJSON(path.join(root,'native/ios/App/App/capacitor.config.json'));
  assert.equal(copiedConfig.server?.hostname,config.server.hostname);
  assert.equal(copiedConfig.server?.iosScheme,config.server.iosScheme);
  assert.ok(!Object.hasOwn(copiedConfig.server||{},'url'),'Synced iOS config must not contain server.url.');
}
console.log(`Passed: ${Object.keys(recorded).length} staged assets, canonical hashes, local OCR/WASM/catalog, native-only bridge, and stable packaged origin${process.argv.includes('--synced')?', including the synced iOS copy':''}.`);
