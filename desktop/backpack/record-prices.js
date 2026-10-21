(function(root){
 'use strict';
 function unitD(item,rate){return item.unitD!=null?item.unitD:item.unitE!=null&&rate>0?item.unitE/rate:null;}
 function valueD(item,rate){if(item.quantity===0)return 0;if(item.unitD==null&&item.valueE!=null&&rate>0)return item.valueE/rate;const unit=unitD(item,rate);return unit==null?null:unit*item.quantity;}
 function totalD(record){if(!Array.isArray(record.items))return record.valueE===0?0:record.valueE!=null&&record.prices?.rateE>0?record.valueE/record.prices.rateE:null;let total=0;for(const i of record.items){const value=valueD(i,record.prices?.rateE);if(value==null)return null;total+=value;}return total;}
 function knownD(record){return record.items.reduce((n,i)=>n+(valueD(i,record.prices?.rateE)??0),0);}
 function edit(ledger,p,at=Date.now()){
  if(p.unitD==null||p.unitD===''||typeof p.unitD!=='number'||!Number.isFinite(p.unitD)||p.unitD<0)throw Error('请填写有效的 D 单价，不能留空或小于零');
  const s=ledger.sessions.find(s=>s.id===p.sessionId),r=s?.records.find(r=>r.id===p.recordId),i=r?.items.find(i=>i.id===p.itemId);if(!i)throw Error('这笔物品记录已变化，请重新打开后修改');
  if(Object.hasOwn(p,'expectedUnitD')&&p.expectedUnitD!==unitD(i,r.prices?.rateE))throw Error('单价已被修改，请重新打开核对');
  const rate=r.prices?.rateE,value=p.unitD*i.quantity,unitE=rate>0?p.unitD*rate:null;if(!Number.isFinite(value)||unitE!=null&&(!Number.isFinite(unitE)||!Number.isFinite(unitE*i.quantity)))throw Error('金额超出范围');
  const oldPrice=r.prices.items.find(x=>x.id===i.id);(r.priceCorrections??=[]).push({at,itemId:i.id,before:structuredClone(i),beforePrice:oldPrice?structuredClone(oldPrice):null,unitD:p.unitD});
  i.unitD=p.unitD;i.unitE=unitE;i.valueE=i.quantity===0?0:unitE==null?null:unitE*i.quantity;
  const price={...oldPrice,id:i.id,valueE:unitE,unitD:p.unitD,source:'本笔手动补价',at};if(oldPrice)Object.assign(oldPrice,price);else r.prices.items.push(price);
  r.valueE=r.items.some(i=>i.valueE==null)?null:r.items.reduce((n,i)=>n+i.valueE,0);return r;
 }
 const api={unitD,valueD,totalD,knownD,edit};if(typeof module!=='undefined')module.exports=api;else root.RecordPrices=api;
})(globalThis);
