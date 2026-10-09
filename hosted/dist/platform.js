// Native capabilities are supplied only by the bundled iOS entry point.
export const isNativeApp=()=>globalThis.SleepAtlasNative?.isNative===true;
export async function pickNativeScreenshots({allPhotos=false,limit=20}={}){
  if(!isNativeApp())throw Error('The native photo picker is unavailable.');
  const bridge=globalThis.SleepAtlasNative;
  const selection=await bridge.pickImages({screenshotsOnly:!allPhotos,limit});
  if(selection.cancelled)return [];
  try{
    if(!Array.isArray(selection.files)||selection.files.length>limit)throw Error('The photo selection is invalid.');
    const files=[];
    for(const item of selection.files){
      const url=new URL(item.webPath),appURL=new URL(location.href);
      // Custom schemes have an opaque origin in some WebKit versions. Compare
      // the actual scheme and host instead of accepting another "null" origin.
      if(url.protocol!==appURL.protocol||url.host!==appURL.host||url.username||url.password||!url.pathname.startsWith('/_capacitor_file_/'))throw Error('The selected photo is unavailable.');
      const response=await fetch(url);if(!response.ok)throw Error(`Could not read ${item.name}.`);
      const blob=await response.blob();
      if(blob.size>12*1024*1024)throw Error(`${item.name} exceeds the 12 MB photo limit.`);
      files.push(new File([blob],item.name,{type:item.mimeType||blob.type}));
    }
    return files;
  }finally{if(selection.sessionId)await bridge.releaseImport({sessionId:selection.sessionId}).catch(()=>{});}
}
export async function exportBackup(data,filename){
  if(isNativeApp())return globalThis.SleepAtlasNative.shareBackup({json:JSON.stringify(data,null,2),filename});
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  return {completed:true};
}
export function configurePlatformUI(document){
  if(!isNativeApp())return;
  document.documentElement.classList.add('native-app');
  for(const id of ['install-button','offline-button','update-button'])document.getElementById(id).hidden=true;
  document.getElementById('browse-all-photos').hidden=false;
  document.querySelector('#dropzone h3').textContent='Add your Pokémon screenshots';
  document.querySelector('#dropzone > p').textContent='Choose up to 20 photos · Read entirely on this device';
}
