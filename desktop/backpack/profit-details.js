(function(global){
 'use strict';
 function calculate(session){
  const groups=new Map();
  function add(kind,id,name,quantity,value){const key=kind+':'+id;if(!groups.has(key))groups.set(key,{kind,id,name,quantity:0,knownD:0,missing:false});const row=groups.get(key);row.quantity+=quantity;row.missing||=value==null;row.knownD+=value??0;}
  for(const record of session?.records||[]){const names=new Map([...(record.before?.allRows||record.before?.rows||[]),...(record.after?.allRows||record.after?.rows||[])].map(r=>[r.id,r.name]));for(const item of record.items){if(!item.quantity)continue;const value=item.valueE===0?0:item.valueE!=null&&record.prices?.rateE>0?Math.abs(item.valueE/record.prices.rateE):null;add(item.quantity>0?'output':'cost',item.id,names.get(item.id)||item.name||item.id.replace(/^custom:/,''),Math.abs(item.quantity),value);}}
  for(const i of session?.incomes||[])add('output','income:'+i.name,i.name,i.quantity,i.valueD);
  for(const c of session?.costs||[]){if(c.chargedE===0)continue;add('cost','cost:'+c.name,c.name||'额外成本',c.quantity,c.chargedE!=null&&c.rateE>0?c.chargedE/c.rateE:null);}
  const rows=[...groups.values()].map(r=>({...r,valueD:r.missing?null:r.knownD,unitD:r.missing||!r.quantity?null:r.knownD/r.quantity})).sort((a,b)=>Number(a.kind==='cost')-Number(b.kind==='cost')||(b.knownD-a.knownD));
  const outputs=rows.filter(r=>r.kind==='output'),costs=rows.filter(r=>r.kind==='cost'),knownOutputD=outputs.reduce((n,r)=>n+r.knownD,0),knownCostD=costs.reduce((n,r)=>n+r.knownD,0);
  return{rows,outputD:outputs.some(r=>r.missing)?null:knownOutputD,costD:costs.some(r=>r.missing)?null:knownCostD,knownOutputD,knownCostD,missing:rows.filter(r=>r.missing).length};
 }
 const api={calculate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.ProfitDetails=api;
})(globalThis);
