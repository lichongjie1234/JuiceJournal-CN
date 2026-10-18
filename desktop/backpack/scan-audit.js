(function(global){
 'use strict';
 function estimated(c){return !c.excluded&&!c.notTracked&&(/估算/.test(c.quantitySource||'')||!Number.isSafeInteger(c.quantity));}
 function needsReview(c){return !c.excluded&&(!c.id||!c.notTracked&&(!c.confirmed||!Number.isSafeInteger(c.quantity)||c.quantity<0||Boolean(c.quantityConflict)||!c.reviewAccepted&&!c.quantityEdited&&estimated(c)));}
 function inspect(draft,baseline,trackedIds,mode='compare'){
  if(!draft)return null;const cells=draft.cells||[],selected=id=>!Array.isArray(trackedIds)||trackedIds.includes(id),actual={};
  const unknown=cells.filter(c=>!c.excluded&&!c.id),invalid=cells.filter(c=>!c.excluded&&c.id&&(!c.confirmed||selected(c.id)&&(!Number.isSafeInteger(c.quantity)||c.quantity<0)));
  for(const c of cells)if(!c.excluded&&c.id&&selected(c.id)&&Number.isSafeInteger(c.quantity))actual[c.id]=(actual[c.id]||0)+c.quantity;
  const starting=!baseline,ignore=mode==='baseline'||starting&&mode!=='empty',before=mode==='empty'?{}:baseline?.quantities||{},ids=new Set([...Object.keys(before).filter(selected),...Object.keys(actual)]),rates=draft.prices?.rateE;
  const same=baseline&&[...new Set([...Object.keys(baseline.quantities||{}).filter(selected),...Object.keys(actual)])].every(id=>(baseline.quantities[id]||0)===(actual[id]||0));const correction=!starting&&!ignore&&!same&&Boolean(baseline.imageHash&&baseline.imageHash===draft.imageHash);const repeat=!starting&&!ignore&&!unknown.length&&!invalid.length&&(baseline.imageHash&&baseline.imageHash===draft.imageHash||mode==='empty'&&same);
  const rows=[...ids].map(id=>{const old=before[id]||0,current=actual[id]||0,quantity=ignore||repeat?0:current-old,cell=cells.find(c=>c.id===id),saved=[...(baseline?.allRows||baseline?.rows||[])].find(c=>c.id===id),price=draft.prices?.items?.find(i=>i.id===id),unitD=price?.valueE>0&&rates>0?price.valueE/rates:null;return {id,name:cell?.name||saved?.name||id.replace(/^custom:/,''),before:starting&&mode!=='empty'?null:old,current,quantity,unitD,valueD:quantity===0?0:unitD==null?null:quantity*unitD,estimated:cells.some(c=>c.id===id&&estimated(c))};});
  const changed=rows.filter(r=>r.quantity!==0),missing=changed.filter(r=>r.valueD==null).length,knownD=changed.reduce((n,r)=>n+(r.valueD||0),0),estimates=cells.filter(c=>c.id&&selected(c.id)&&estimated(c)).length;
  return {mode,starting,correction,baselineOnly:ignore,rows,changed:changed.length,increased:changed.filter(r=>r.quantity>0).length,decreased:changed.filter(r=>r.quantity<0).length,missing,knownD,valueD:missing?null:knownD,estimated:estimates,unknown:unknown.length,invalid:invalid.length,blocked:unknown.length+invalid.length,ignored:cells.filter(c=>c.excluded||c.id&&!selected(c.id)).length,offline:Boolean(draft.prices?.offline),duplicate:!correction&&!starting&&!ignore&&!changed.length&&!unknown.length&&!invalid.length};
 }
 function warnings(a,baseline,draft){
  if(!a)return [];const out=[];const add=(type,text,ids=[])=>out.push({type,text,ids});
  if(a.unknown||a.invalid)add('incomplete',`名称或数量未完成 ${a.blocked} 格，请先修改`);
  if(a.estimated)add('estimate',`${a.estimated} 格数量为估算，可直接改数后保存`);
  if(a.missing)add('price',`${a.missing} 项变化缺价，金额待补，不按零计算`);
  if(a.offline)add('offline','正在使用缓存行情');
  const reduced=a.rows.filter(r=>r.current<r.before),previous=a.rows.filter(r=>r.before>0),gone=reduced.filter(r=>r.current===0);
  if(!a.baselineOnly&&!a.starting&&!a.correction&&reduced.length)add('decrease',gone.length>=Math.max(1,Math.ceil(previous.length/2))?'多项物品消失，可能已存仓；截图无法判断原因，请选择保存方式':'发现物品减少：可能是存仓、消耗或交易，请确认保存方式',reduced.map(r=>r.id));
  const jumps=a.rows.filter(r=>r.before>0&&r.current>=Math.max(20,r.before*5));if(jumps.length)add('jump','数量增幅较大，请重点核对：'+jumps.map(r=>r.name+' '+r.before+' → '+r.current).join('、'),jumps.map(r=>r.id));
  const switched=(draft.cells||[]).filter(c=>!c.excluded&&c.id&&(baseline?.cells||[]).some(old=>old.visualKey&&old.visualKey===c.visualKey&&old.id&&old.id!==c.id));if(switched.length)add('identity','相同图像出现不同名称，请检查名称或纠错规则',switched.map(c=>c.id));
  return out;
 }
 const api={inspect,estimated,needsReview,warnings};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.ScanAudit=api;
})(globalThis);
