(() => {
  const get=id=>document.getElementById(id);let installPrompt;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;get('native-install').hidden=false});
  window.addEventListener('appinstalled',()=>{installPrompt=null;get('native-install').hidden=true;get('install-status').textContent='Sleep Atlas has been added. Launch it from its app icon.'});
  get('native-install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;get('native-install').hidden=true}};
  get('install-button').onclick=()=>{
    const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
    get('install-status').textContent=standalone?'You’re already using the home-screen app.':'Add the moon icon to your Home Screen and open Sleep Atlas in its own window.';
    get('install-offline-note').textContent='Open once online to cache the app. Your saved collection, calculations, and manual entry then work offline. Screenshot reading needs an initial download. Sign-in may require a connection.';
    if(!get('install-dialog').open)get('install-dialog').showModal();
  };
})();
