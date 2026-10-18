 'use strict';
const stores=['learned','exactReviewed','visualRules','exclusions'];
function identity(v){return JSON.stringify([v.id||'',v.name||'']);}
function list(state){const groups=new Map();for(const store of stores)for(const v of Object.values(state[store]||{})){const key=identity(v);if(!groups.has(key))groups.set(key,{key,id:v.id||'',name:v.name||'未命名排除图标',identity:0,quantity:0,excluded:0});const row=groups.get(key);if(store==='exclusions'||v.excluded)row.excluded++;else row.identity++;}
 for(const key of Object.keys(state.quantityCorrections||{})){const id=key.slice(0,key.lastIndexOf(':')),row=[...groups.values()].find(r=>r.id===id);if(row)row.quantity++;else{const group=JSON.stringify([id,'']);if(!groups.has(group))groups.set(group,{key:group,id,name:id,identity:0,quantity:0,excluded:0});groups.get(group).quantity++;}}
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
}
function remove(state,key){const row=list(state).find(r=>r.key===key);if(!row)throw Error('识别记忆已变化，请重新选择');const matches=v=>identity(v)===key;
 for(const store of stores){if(Array.isArray(state[store]))state[store]=state[store].filter(v=>!matches(v));else for(const [k,v]of Object.entries(state[store]||{}))if(matches(v))delete state[store][k];}
 // Numeric crop corrections are keyed by item ID; clear them only after all variants for that ID are gone.
 if(!stores.some(store=>Object.values(state[store]||{}).some(v=>v.id===row.id)))for(const k of Object.keys(state.quantityCorrections||{}))if(k.slice(0,k.lastIndexOf(':'))===row.id)delete state.quantityCorrections[k];
 return row;
}
module.exports={list,remove};
