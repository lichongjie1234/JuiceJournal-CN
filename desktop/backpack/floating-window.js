'use strict';
const path=require('node:path'),W=require('./window-mode');
function create({BrowserWindow,screen,directory,settings,getView,changed,closed,isQuitting,isLastWindow}){
 let mini=null,tooltip=null,loading=null,tipLoading=null,hideTimer,wanted=false,restoring=false;
 const alive=w=>w&&!w.isDestroyed();
 function remember(){if(!alive(mini)||restoring||mini.isMinimized())return;const b=mini.isMaximized()?mini.getNormalBounds():mini.getBounds(),display=screen.getDisplayMatching(b);settings().floatingBounds=b;settings().floatingDisplayId=display.id;settings().floatingWorkArea={...display.workArea};}
 function appearance(){if(alive(mini)){mini.setOpacity(W.opacity(settings().miniOpacity??1));mini.setAlwaysOnTop(settings().miniPin!==false);mini.webContents.send('tracker:float',getView());}}
 function secure(w){w.setMenuBarVisibility(false);w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());}
 async function ensure(){if(alive(mini)&&!loading)return mini;if(loading)return loading;
  loading=(async()=>{const displays=screen.getAllDisplays(),primary=screen.getPrimaryDisplay(),preferred=displays.find(d=>d.id===settings().floatingDisplayId),fallback=preferred||displays.find(d=>d.id!==primary.id)||primary;let saved=settings().floatingBounds||settings().miniBounds;
   const previous=settings().floatingWorkArea;if(saved&&preferred&&previous)saved={...saved,x:saved.x+preferred.workArea.x-previous.x,y:saved.y+preferred.workArea.y-previous.y};
   const bounds=W.bounds(saved,true,displays,fallback);restoring=true;
   mini=new BrowserWindow({...bounds,minWidth:280,minHeight:210,title:'POE2 收益浮窗',show:false,skipTaskbar:false,alwaysOnTop:settings().miniPin!==false,opacity:W.opacity(settings().miniOpacity??1),webPreferences:{preload:path.join(directory,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});secure(mini);
   for(const event of ['move','resize'])mini.on(event,()=>{if(!restoring){remember();changed();}});
   mini.on('close',()=>{remember();if(!isQuitting()&&!isLastWindow())settings().floatingVisible=false;hideTooltip();changed();});mini.on('closed',()=>{mini=null;closed();});
   await mini.loadFile(path.join(directory,'floating.html'));mini.setBounds(bounds);restoring=false;remember();mini.webContents.send('tracker:float',getView());return mini;
  })();try{return await loading;}finally{loading=null;restoring=false;}
 }
 async function show(){const w=await ensure();settings().floatingVisible=true;w.showInactive();changed();return w;}
 async function applySettings(){if(!alive(mini))return;if(loading)await loading;const displays=screen.getAllDisplays(),primary=screen.getPrimaryDisplay(),preferred=displays.find(d=>d.id===settings().floatingDisplayId),fallback=preferred||displays.find(d=>d.id!==primary.id)||primary;let saved=settings().floatingBounds||settings().miniBounds;const old=settings().floatingWorkArea;if(saved&&preferred&&old)saved={...saved,x:saved.x+preferred.workArea.x-old.x,y:saved.y+preferred.workArea.y-old.y};restoring=true;try{mini.setBounds(W.bounds(saved,true,displays,fallback));appearance();}finally{restoring=false;}remember();changed();}
 function hide(){if(alive(mini)){remember();mini.hide();}settings().floatingVisible=false;hideTooltip();changed();}
 function broadcast(){if(alive(mini))mini.webContents.send('tracker:float',getView());if(alive(tooltip)&&tooltip.isVisible())tooltip.webContents.send('tracker:tooltip',getView().details);}
 function hideTooltip(delay=0){wanted=false;clearTimeout(hideTimer);if(delay)hideTimer=setTimeout(()=>{if(!wanted&&alive(tooltip))tooltip.hide();},delay);else if(alive(tooltip))tooltip.hide();}
 async function hover(p){
  if(p?.keep){wanted=true;clearTimeout(hideTimer);return;}
  if(!p?.visible){hideTooltip(130);return;}
  wanted=true;clearTimeout(hideTimer);if(!alive(mini)||!mini.isVisible())return;
  if(!alive(tooltip)||tipLoading){if(!tipLoading)tipLoading=(async()=>{tooltip=new BrowserWindow({width:420,height:220,frame:false,show:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:true,webPreferences:{preload:path.join(directory,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});secure(tooltip);tooltip.on('closed',()=>{tooltip=null;});await tooltip.loadFile(path.join(directory,'profit-tooltip.html'));})();try{await tipLoading;}finally{tipLoading=null;}}
  if(!wanted||!alive(mini)||!mini.isVisible())return;
  const cursor=screen.getCursorScreenPoint(),area=screen.getDisplayNearestPoint(cursor).workArea,details=getView().details,width=Math.min(420,area.width-16),height=Math.min(440,area.height-16,Math.max(210,155+details.rows.length*29));
  tooltip.setBounds({x:Math.max(area.x,Math.min(cursor.x+14,area.x+area.width-width)),y:Math.max(area.y,Math.min(cursor.y+16,area.y+area.height-height)),width,height});tooltip.webContents.send('tracker:tooltip',details);tooltip.showInactive();
 }
 function destroy(){clearTimeout(hideTimer);if(alive(tooltip))tooltip.destroy();if(alive(mini))mini.destroy();}
 return{show,hide,applySettings,broadcast,appearance,remember,hover,hideTooltip,destroy,isVisible:()=>alive(mini)&&mini.isVisible(),get window(){return mini;},get tooltip(){return tooltip;}};
}
module.exports={create};
