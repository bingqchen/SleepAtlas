const EXPECTED_VERSION='v37';
export function offlineRequest(worker,type,onProgress=()=>{},timeout=65000){
  return new Promise((resolve,reject)=>{
    const channel=new MessageChannel();let timer;
    const finish=(error,result)=>{clearTimeout(timer);channel.port1.close();error?reject(error):resolve(result)};
    const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(Error('Offline download is not responding. Check for app updates, then try again.')),timeout)};
    channel.port1.onmessage=({data})=>{
      if(data.kind==='error'){finish(Error(data.message));return}
      if(data.version!==EXPECTED_VERSION){finish(Error('An app update is ready. Reload Sleep Atlas, then download again.'));return}
      if(data.kind==='progress'){arm();onProgress(data)}
      else if(data.kind==='done')finish(null,data);
    };
    arm();try{worker.postMessage({type},[channel.port2])}catch(error){finish(error)}
  });
}
export async function activeWorker(getRegistration,serviceWorker=navigator.serviceWorker,timeout=20000){
  let timer,removeListeners=()=>{},expired=false;
  const setup=(async()=>{
    let registration=await getRegistration();
    const candidate=()=>registration?.installing||registration?.waiting||registration?.active;
    // Failed installs can leave an empty registration. Start a fresh attempt.
    if(!candidate()||candidate().state==='redundant'){
      registration=await serviceWorker.register('/sw.js',{updateViaCache:'none'});
      if(!candidate()&&!expired)await registration.update();
    }
    if(expired)return;
    return new Promise((resolve,reject)=>{
      const watched=new Set();let lastWorker;
      removeListeners=()=>{registration.removeEventListener('updatefound',check);for(const worker of watched)worker.removeEventListener('statechange',check)};
      function check(){
        // Keep watching a pending worker even if a failed update removes it
        // from the registration; an older active worker is not that update.
        const worker=registration.installing||registration.waiting||lastWorker||registration.active;
        lastWorker=worker;
        if(!worker||worker.state==='redundant'){removeListeners();reject(Error('Offline setup failed. Check your connection and tap Retry download.'));return}
        if(worker.state==='activated'){removeListeners();resolve(worker);return}
        if(!watched.has(worker)){watched.add(worker);worker.addEventListener('statechange',check)}
      }
      registration.addEventListener('updatefound',check);check();
    });
  })();
  try{return await Promise.race([setup,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Offline setup timed out. Check your connection and tap Retry download.'))},timeout)})])}
  catch(error){if(error.name==='SecurityError')throw Error('Offline storage is blocked in this browser. Open Sleep Atlas in Safari and try again.');throw error}
  finally{clearTimeout(timer);removeListeners()}
}
export function setupOffline({closeMenu,getRegistration}){
  const $=id=>document.getElementById(id);let busy=false,ready=false,checking=false;
  const status=message=>{$('offline-status').textContent=message};
  const worker=()=>{
    if(!window.isSecureContext||!('serviceWorker' in navigator)||!('caches' in window))throw Error('Offline downloads need Safari or a browser with offline storage. Open Sleep Atlas at its HTTPS address.');
    return activeWorker(getRegistration);
  };
  function showProgress(data){
    $('offline-progress').hidden=false;$('offline-progress').max=data.total;$('offline-progress').value=data.complete;
    status(`Saving files: ${data.complete} of ${data.total}. Keep this app open until complete.`);
  }
  function showStatus(data){
    ready=data.ready;$('offline-progress').hidden=true;
    status(ready?`Ready for offline use · Reader ${data.version}. The app and screenshot reader are saved on this device.`:`${data.complete} of ${data.total} files saved. Download the remaining files for offline screenshot reading.`);
    $('offline-download').textContent=ready?'Check downloaded files':'Download for offline use';
  }
  async function check(){
    checking=true;$('offline-download').disabled=true;status('Checking downloaded files…');
    try{showStatus(await offlineRequest(await worker(),'atlas:offline-status',undefined,20000))}
    catch(error){ready=false;status(error.message);$('offline-download').textContent='Try again'}
    finally{checking=false;$('offline-download').disabled=false}
  }
  $('offline-button').onclick=()=>{closeMenu(true);if(!$('offline-dialog').open)$('offline-dialog').showModal();if(!busy&&!checking)check()};
  $('offline-download').onclick=async()=>{
    if(busy||checking)return;
    if(ready){await check();return}
    busy=true;$('offline-download').disabled=true;status('Preparing the offline download…');
    try{navigator.storage?.persist?.().catch(()=>{})}catch{}
    try{showStatus(await offlineRequest(await worker(),'atlas:offline-download',showProgress))}
    catch(error){ready=false;$('offline-progress').hidden=true;status(error.message);$('offline-download').textContent='Retry download'}
    finally{busy=false;$('offline-download').disabled=false}
  };
  $('offline-install').onclick=()=>{$('offline-dialog').close();$('install-button').click()};
  return {isBusy:()=>busy||checking};
}
