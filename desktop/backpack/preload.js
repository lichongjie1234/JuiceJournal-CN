const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tracker',{
 call:(action,payload)=>ipcRenderer.invoke('tracker:action',action,payload),
 onFloatUpdate:fn=>{ipcRenderer.on('tracker:float',(_e,value)=>fn(value));},
 onTooltipUpdate:fn=>{ipcRenderer.on('tracker:tooltip',(_e,value)=>fn(value));},
 onNavigate:fn=>{ipcRenderer.on('tracker:navigate',(_e,value)=>fn(value));},
 onWindowUpdate:fn=>{ipcRenderer.on('tracker:window',(_e,value)=>fn(value));},
 onUpdate:fn=>{ipcRenderer.on('tracker:update',(_e,value)=>fn(value));}
});
