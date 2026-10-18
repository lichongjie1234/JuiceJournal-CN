'use strict';
const Market=require('./market');
function create({session,BrowserWindow,directory}){
 const ses=session.fromPath(directory);let win;
 const allowed=value=>{try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='qq.com'||u.hostname.endsWith('.qq.com'));}catch{return false;}};
 ses.on('will-download',e=>e.preventDefault());
 function secure(w){w.setMenuBarVisibility(false);w.webContents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});w.webContents.setWindowOpenHandler(({url})=>allowed(url)?{action:'allow',overrideBrowserWindowOptions:{webPreferences:{session:ses,contextIsolation:true,nodeIntegration:false,sandbox:true}}}:{action:'deny'});w.webContents.on('did-create-window',secure);}
 async function login(){if(win&&!win.isDestroyed()){win.show();win.focus();return;}win=new BrowserWindow({width:1100,height:780,minWidth:780,minHeight:600,title:'国服市集 · 请在官方网站登录',webPreferences:{session:ses,contextIsolation:true,nodeIntegration:false,sandbox:true}});secure(win);win.on('closed',()=>{win=null;});await win.loadURL(Market.HOME);}
 return {login,fetch:(url,options)=>ses.fetch(url,options),close:()=>{if(win&&!win.isDestroyed())win.close();}};
}
module.exports={create};
