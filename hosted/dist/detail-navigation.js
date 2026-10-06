export function detailNeighbors(ids,current){
  const index=ids.indexOf(current);
  return {index,total:ids.length,previous:index>0?ids[index-1]:null,next:index>=0&&index<ids.length-1?ids[index+1]:null};
}

// Recognize only deliberate, single-finger horizontal swipes. Touch listeners
// preserve Safari's vertical scrolling and pinch zoom without a pan-y rule
// on the dialog, which would also disable horizontal scrolling in its tables.
export function attachDetailSwipes(element,{enabled,navigate,hasSelection=()=>!!globalThis.getSelection?.()?.toString()}){
  let gesture=null,suppressClickUntil=0;
  const reset=()=>{gesture=null};
  const blocked=target=>{
    if(target.closest?.('button,a,input,select,textarea,summary,[contenteditable],.dialog-footer'))return true;
    const scroller=target.closest?.('.table-wrap,pre');
    return !!scroller&&scroller.scrollWidth>scroller.clientWidth+1;
  };
  const start=event=>{
    reset();suppressClickUntil=0;
    if(!enabled()||event.touches.length!==1||blocked(event.target)||hasSelection())return;
    const t=event.touches[0];
    // Leave Safari's edge gestures alone.
    const width=element.ownerDocument?.documentElement?.clientWidth;
    if(width&&(t.clientX<20||t.clientX>width-20))return;
    gesture={id:t.identifier,x:t.clientX,y:t.clientY,time:event.timeStamp,horizontal:false};
  };
  const move=event=>{
    if(!gesture)return;
    if(event.touches.length!==1||!enabled()||hasSelection()){reset();return}
    const t=event.touches[0];if(t.identifier!==gesture.id){reset();return}
    const x=Math.abs(t.clientX-gesture.x),y=Math.abs(t.clientY-gesture.y);
    if(!gesture.horizontal&&y>12&&y>=x){reset();return}
    if(x>12&&x>y*1.5)gesture.horizontal=true;
    if(gesture.horizontal){
      if(!event.cancelable){reset();return}
      event.preventDefault();
    }
  };
  const end=event=>{
    const g=gesture;reset();
    if(!g||event.touches.length||!enabled()||hasSelection())return;
    const t=Array.from(event.changedTouches).find(t=>t.identifier===g.id);if(!t)return;
    const dx=t.clientX-g.x,dy=t.clientY-g.y;
    if(Math.abs(dx)<60||Math.abs(dx)<=Math.abs(dy)*1.5||event.timeStamp-g.time>900)return;
    if(event.cancelable)event.preventDefault();
    suppressClickUntil=event.timeStamp+500;
    navigate(dx<0?1:-1);
  };
  const click=event=>{
    if(event.timeStamp<suppressClickUntil){event.preventDefault();event.stopPropagation()}
  };
  element.addEventListener('touchstart',start,{passive:true});
  element.addEventListener('touchmove',move,{passive:false});
  element.addEventListener('touchend',end,{passive:false});
  element.addEventListener('touchcancel',reset,{passive:true});
  element.addEventListener('click',click,true);
  return ()=>{
    reset();element.removeEventListener('touchstart',start);element.removeEventListener('touchmove',move);
    element.removeEventListener('touchend',end);element.removeEventListener('touchcancel',reset);element.removeEventListener('click',click,true);
  };
}
