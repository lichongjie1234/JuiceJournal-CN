(function(global){
 'use strict';
 const day=at=>Number.isFinite(at)?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at)):'';
 const types={inventory:'库存变化',income:'意外收入',cost:'额外成本',memo:'库存成本备忘'};
 function flatten(sessions,catalog=[]){
  const names=new Map(catalog.map(i=>[i.id,i.name])),rows=[];
  for(const s of sessions){
   const add=(r,type,entry,record)=>rows.push({...r,type,typeName:types[type],at:entry.at??record?.at??s.startedAt,sessionId:s.id,sessionStart:s.startedAt,status:s.endedAt?'ended':'current',season:s.season||'未记录',entryId:entry.id,recordId:record?.id,day:day(entry.at??record?.at??s.startedAt)});
   for(const r of s.records||[])for(const i of r.items||[]){if(!i.quantity)continue;const saved=[...(r.after?.allRows||r.after?.rows||[]),...(r.before?.allRows||r.before?.rows||[])].find(x=>x.id===i.id),name=saved?.name||i.name||names.get(i.id)||i.id.replace(/^custom:/,'');const unitD=i.unitE!=null&&r.prices?.rateE>0?i.unitE/r.prices.rateE:null,valueD=i.valueE===0?0:i.valueE!=null&&r.prices?.rateE>0?i.valueE/r.prices.rateE:null;add({itemId:i.id,name,quantity:i.quantity,unitD,valueD,before:r.before?.quantities?.[i.id]??null,after:r.after?.quantities?.[i.id]??null,priceAt:r.prices?.at,basis:r.prices?.basis||'历史价格快照'},'inventory',r,r);}
   for(const i of s.incomes||[])add({itemId:catalog.find(x=>x.name===i.name)?.id||'custom:'+i.name,name:i.name,quantity:i.quantity,unitD:i.unitD,valueD:i.valueD,basis:'手动 D 单价'},'income',i);
   for(const c of s.costs||[]){const memo=c.mode==='inventory',unitD=c.unitE!=null&&c.rateE>0?c.unitE/c.rateE:null,valueD=memo?0:c.chargedE===0?0:c.chargedE!=null&&c.rateE>0?-c.chargedE/c.rateE:null;add({itemId:catalog.find(i=>i.name===c.name)?.id||'custom:'+(c.name||c.id),name:c.name||names.get(c.id)||'临时支出',quantity:-c.quantity,unitD,valueD,basis:memo?'已由库存变化计费，此处不重复扣除':c.source||'记录时单价'},memo?'memo':'cost',c);}
  }
  return rows;
 }
 function query(rows,f={}){
  const words=(f.search||'').normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),min=f.minimum===''||f.minimum==null?null:Number(f.minimum),max=f.maximum===''||f.maximum==null?null:Number(f.maximum);
  const out=rows.filter(r=>(!f.start||r.day>=f.start)&&(!f.end||r.day<=f.end)&&(!f.type||r.type===f.type)&&(!f.status||r.status===f.status)&&(!f.season||r.season===f.season)&&(!f.sessionId||r.sessionId===f.sessionId)&&words.every(w=>(r.name+' '+r.typeName+' '+r.season).toLocaleLowerCase().includes(w))&&(!f.direction||(f.direction==='positive'?r.valueD!=null&&r.valueD>0:f.direction==='negative'?r.valueD!=null&&r.valueD<0:f.direction==='unknown'?r.valueD==null:r.valueD===0))&&(min==null||(r.valueD!=null&&r.valueD>=min))&&(max==null||(r.valueD!=null&&r.valueD<=max)));
  const sort=f.sort||'time-desc';out.sort((a,b)=>sort==='time-asc'?a.at-b.at:sort==='name'?a.name.localeCompare(b.name,'zh-CN'):sort==='value-desc'||sort==='value-asc'?(a.valueD==null?b.valueD==null?0:1:b.valueD==null?-1:(a.valueD-b.valueD)*(sort==='value-desc'?-1:1)):b.at-a.at);return out;
 }
 function summarize(rows){let income=0,cost=0,unknown=0;for(const r of rows){if(r.valueD==null){unknown++;continue;}if(r.valueD>=0)income+=r.valueD;else cost-=r.valueD;}return {income,cost,knownNet:income-cost,net:unknown?null:income-cost,unknown,count:rows.length,sessions:new Set(rows.map(r=>r.sessionId)).size};}
 function group(rows,key='day'){
  const map=new Map();for(const r of rows){const id=key==='item'?r.itemId:key==='session'?r.sessionId:key==='type'?r.type:r.day,label=key==='item'?r.name:key==='session'?new Date(r.sessionStart).toLocaleString('zh-CN',{hour12:false}):key==='type'?r.typeName:r.day;if(!map.has(id))map.set(id,{id,label,rows:[]});map.get(id).rows.push(r);}
  return [...map.values()].map(g=>({...g,...summarize(g.rows),quantity:key==='item'?g.rows.reduce((n,r)=>n+(r.type==='memo'?0:r.quantity),0):null}));
 }
 function csv(data){const cell=v=>{if(v==null)return '';const s=String(v);return '"'+(typeof v==='string'&&/^[=+@\-\t\r]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"';};return data.map(row=>row.map(cell).join(',')).join('\r\n');}
 const api={day,types,flatten,query,summarize,group,csv};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.HistoryModel=api;
})(globalThis);
