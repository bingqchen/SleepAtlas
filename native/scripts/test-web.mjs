import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const tests=path.join(root,'hosted/tests');
let indexedDB;
try{indexedDB=fileURLToPath(import.meta.resolve('fake-indexeddb/auto'))}
catch{throw Error('Install the root dependencies with pnpm install --frozen-lockfile before running web tests.')}
const files=(await readdir(tests)).filter(name=>name.endsWith('.mjs')).sort();
if(!files.length)throw Error('No hosted web tests found.');
const failed=[];

// Each existing suite gets a fresh process and an isolated in-memory database.
// Suites without IndexedDB simply ignore the extra module-path argument.
for(const [index,file] of files.entries()){
  console.log(`\n[${index+1}/${files.length}] ${file}`);
  const result=spawnSync(process.execPath,[path.join(tests,file),indexedDB],{
    cwd:root,stdio:'inherit',timeout:180000,
  });
  if(result.error||result.status!==0){
    failed.push(file);
    console.error(`${file} failed (${result.error?.message||result.signal||result.status}).`);
  }
}
if(failed.length)throw Error(`${failed.length}/${files.length} hosted web suites failed: ${failed.join(', ')}`);
console.log(`\nPassed all ${files.length} hosted web suites. IndexedDB was simulated in memory; no browser collection was accessed.`);
