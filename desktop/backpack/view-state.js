 'use strict';
// Only presentation fields cross IPC; original evidence stays in the ledger.
const cellFields=['index','id','name','grade','kind','quantity','remainingUses','confirmed','excluded','notTracked','quantitySource','visualKey'];
function snapshot(value){if(!value)return value;const {cells,prices,bank,comparisonBaseline,...rest}=value;return {...rest,cells:cells?.map(c=>Object.fromEntries(cellFields.filter(k=>c[k]!==undefined).map(k=>[k,c[k]])))};}
function session(value){const {baseline,records,rebases,deletedRecords,...rest}=value;return {...rest,baseline:snapshot(baseline),records:records.map(r=>({...r,before:snapshot(r.before),after:snapshot(r.after),prices:r.prices?{...r.prices,items:r.prices.items?.filter(p=>r.items.some(i=>i.id===p.id))}:r.prices}))};}
module.exports={snapshot,session};
