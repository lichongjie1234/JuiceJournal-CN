const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tracker',{
 call:(action,payload)=>ipcRenderer.invoke('tracker:action',action,payload),
 onUpdate:fn=>{ipcRenderer.on('tracker:update',(_e,value)=>fn(value));}
});
