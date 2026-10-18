'use strict';
function opacity(value){if(typeof value!=='number'||!Number.isFinite(value))throw Error('透明度数值无效');return Math.max(.4,Math.min(1,value));}
function bounds(saved,mini,displays,fallback){
 const min=mini?[280,210]:[780,620],size=mini?[340,240]:[1040,850],max=mini?[Infinity,Infinity]:[1240,950];let b={...saved};
 if(!Number.isFinite(b.x)||!Number.isFinite(b.y)||!displays.some(d=>b.x<d.workArea.x+d.workArea.width&&b.x+(b.width||size[0])>d.workArea.x&&b.y<d.workArea.y+d.workArea.height&&b.y+(b.height||size[1])>d.workArea.y))b={...b,x:fallback.workArea.x+30,y:fallback.workArea.y+30};
 const overlap=d=>{const a=d.workArea;return Math.max(0,Math.min(b.x+(b.width||size[0]),a.x+a.width)-Math.max(b.x,a.x))*Math.max(0,Math.min(b.y+(b.height||size[1]),a.y+a.height)-Math.max(b.y,a.y));};const best=displays.reduce((best,d)=>overlap(d)>overlap(best)?d:best,fallback);const area=best.workArea;
 const width=Math.min(area.width,max[0],Math.max(min[0],Number.isFinite(b.width)?b.width:size[0])),height=Math.min(area.height,max[1],Math.max(min[1],Number.isFinite(b.height)?b.height:size[1]));
 return{x:Math.round(Math.max(area.x,Math.min(b.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(b.y,area.y+area.height-height))),width:Math.round(width),height:Math.round(height)};
}
function remember(win,settings){settings[settings.miniMode?'miniBounds':'bounds']=win.isMaximized()?win.getNormalBounds():win.getBounds();}
function apply(win,settings,mini,displays,fallback,saveCurrent=true){
 const previous=win.isMaximized()?win.getNormalBounds():win.getBounds();
 if(saveCurrent)remember(win,settings);if(win.isMaximized())win.unmaximize();settings.miniMode=Boolean(mini);
 const target=bounds(settings[mini?'miniBounds':'bounds']||{x:previous.x,y:previous.y},mini,displays,fallback);
 if(mini)win.setMinimumSize(280,210);win.setBounds(target);if(!mini)win.setMinimumSize(780,620);
 win.setOpacity(mini?opacity(settings.miniOpacity??1):1);win.setAlwaysOnTop(Boolean(settings[mini?'miniPin':'pin']));
}
module.exports={opacity,bounds,remember,apply};
