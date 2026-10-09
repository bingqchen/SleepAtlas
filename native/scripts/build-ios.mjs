import {access,mkdir,readFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const developerDir=process.env.DEVELOPER_DIR||'/Applications/Xcode.app/Contents/Developer';
const xcodebuild=path.join(developerDir,'usr/bin/xcodebuild');
const derivedData=path.join(root,'native/build');
const logPath=path.join(derivedData,'xcodebuild.log');

function run(command,args,options={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,env:{...process.env,DEVELOPER_DIR:developerDir},...options});
    child.once('error',reject);
    child.once('exit',(code,signal)=>code===0?resolve():reject(Error(`${path.basename(command)} failed (${signal||code}).`)));
  });
}

try{
  await access(xcodebuild);
}catch{
  throw Error('Full Xcode is required. Set DEVELOPER_DIR to its Contents/Developer directory; Command Line Tools alone cannot build iOS.');
}
// Require an explicit sync, so building never silently changes the native project.
await run(process.execPath,[path.join(root,'native/tests/bundle.mjs'),'--synced'],{stdio:'inherit'});
await mkdir(derivedData,{recursive:true});
const log=createWriteStream(logPath,{flags:'w'});
await new Promise((resolve,reject)=>{log.once('open',resolve);log.once('error',reject)});
console.log(`Building unsigned Release for generic iOS with ${developerDir}.\nBuild log: ${logPath}`);
try{
  await run(xcodebuild,[
    '-project',path.join(root,'native/ios/App/App.xcodeproj'),
    '-scheme','App',
    '-configuration','Release',
    '-sdk','iphoneos',
    '-destination','generic/platform=iOS',
    '-derivedDataPath',derivedData,
    '-clonedSourcePackagesDirPath',path.join(derivedData,'SourcePackages'),
    'CODE_SIGNING_ALLOWED=NO',
    'CODE_SIGNING_REQUIRED=NO',
    'CODE_SIGN_IDENTITY=',
    'build',
  ],{stdio:['ignore',log,log]});
}catch(error){
  await new Promise(resolve=>log.end(resolve));
  const tail=(await readFile(logPath,'utf8')).split('\n').slice(-70).join('\n');
  console.error(tail);
  throw Error(`${error.message} Full output: ${logPath}`,{cause:error});
}
await new Promise(resolve=>log.end(resolve));
const product=path.join(derivedData,'Build/Products/Release-iphoneos/App.app');
await access(product);
console.log(`Unsigned build succeeded: ${product}\nThis checks compilation and packaging; it does not install or exercise the app on a device.`);
