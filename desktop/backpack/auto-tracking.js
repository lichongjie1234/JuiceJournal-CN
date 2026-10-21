 'use strict';
function select(current,items,baselineIds=[]){
 const known=items.filter(i=>Number.isFinite(i.unitD)&&i.unitD>=0);if(!known.length)return current;
 const next=new Set(current??[...items.map(i=>i.id),...baselineIds]);for(const item of known){if(item.unitD>=0.1)next.add(item.id);else next.delete(item.id);}return [...next];
}
module.exports={select};
