'use strict';
const {randomUUID} = require('node:crypto');
const clone = value => structuredClone(value);
function totals(rows) {
  const out = {};
  for (const r of rows) {
    if (!r.id || r.confirmed !== true || !Number.isSafeInteger(r.quantity) || r.quantity < 0) throw Error('存在未确认物品、等级或数量');
    out[r.id] = (out[r.id] || 0) + r.quantity;
    if (!Number.isSafeInteger(out[r.id])) throw Error('数量超出范围');
  }
  return out;
}
class Ledger {
  constructor(state = {schema:1, sessions:[]}) {this.state = clone(state);}
  get current() {return this.state.sessions.find(s => !s.endedAt);}
  scan(scan, prices, at = Date.now()) {
    if (!scan.validPage || !scan.scope || !scan.season || !scan.imageHash || !scan.screenshot || !scan.allCellsReviewed) throw Error('仓库页或截图尚未验证');
    const quantities = totals(scan.rows);
    let s = this.current;
    if (s && (s.scope !== scan.scope || s.season !== scan.season)) throw Error('统计仓库或赛季不一致');
    if (s && (s.baseline.imageHash === scan.imageHash || [...new Set([...Object.keys(s.baseline.quantities),...Object.keys(quantities)])].every(id=>(s.baseline.quantities[id]||0)===(quantities[id]||0)))) return {duplicate:true};
    const snapshot = {...clone(scan), quantities, at};
    if (!s) {
      s = {id:randomUUID(), season:scan.season, scope:scan.scope, startedAt:at, pausedMs:0, pausedAt:null, baseline:snapshot, records:[], costs:[], maps:0};
      this.state.sessions.push(s); return {started:true};
    }
    if (prices.season !== s.season) throw Error('行情赛季不一致');
    const a = s.baseline.quantities, b = quantities;
    const items = [...new Set([...Object.keys(a), ...Object.keys(b)])].map(id => {
      const quantity = (b[id] || 0) - (a[id] || 0);
      const price = prices.items.find(p => p.id === id);
      const unitE = price && Number.isFinite(price.valueE) && price.valueE > 0 ? price.valueE : null;
      return {id, quantity, unitE, valueE:quantity === 0 ? 0 : unitE == null ? null : quantity * unitE};
    });
    const record = {id:randomUUID(), at, before:clone(s.baseline), after:snapshot, prices:clone(prices), items,
      valueE:items.some(i => i.valueE == null) ? null : items.reduce((sum,i) => sum+i.valueE,0)};
    s.records.push(record); s.baseline = snapshot; return clone(record);
  }
  rebase(scan,prices,at=Date.now()){
    if(!this.current)return this.scan(scan,prices,at);
    const s=this.current;if(!scan.validPage||!scan.allCellsReviewed||scan.scope!==s.scope||scan.season!==s.season||!scan.screenshot||!scan.imageHash)throw Error('更新基线的截图范围或赛季无效');
    const before=clone(s.baseline);s.baseline={...clone(scan),quantities:totals(scan.rows),at};
    s.rebases??=[];s.rebases.push({at,before,after:clone(s.baseline)});return {rebased:true};
  }
  scanFromEmpty(scan,prices,at=Date.now()){
    const empty={...clone(scan),cells:[],rows:[],allRows:[],imageHash:'empty:'+randomUUID(),screenshot:scan.screenshot};
    this.rebase(empty,prices,at);return this.scan(scan,prices,at);
  }
  deleteRecord(sessionId,recordId){const s=this.state.sessions.find(s=>s.id===sessionId);if(!s)throw Error('找不到本轮记录');const index=s.records.findIndex(r=>r.id===recordId);if(index<0)throw Error('该库存变化已删除或不存在');const [record]=s.records.splice(index,1);s.deletedRecords??=[];s.deletedRecords.push({...clone(record),deletedAt:Date.now()});return {deleted:true};}
  editLatestQuantities(changes){
    const s=this.current,r=s?.records.at(-1);if(!r)throw Error('没有可编辑的库存变化');
    if(!Array.isArray(changes)||changes.length!==r.items.length||new Set(changes.map(c=>c.id)).size!==changes.length||changes.some(c=>!r.items.some(i=>i.id===c.id)||!Number.isSafeInteger(c.quantity)))throw Error('只能修改现有物品的整数数量');
    const next=clone(r);for(const c of changes){const i=next.items.find(i=>i.id===c.id),after=(r.before.quantities[c.id]||0)+c.quantity;if(!Number.isSafeInteger(after)||after<0)throw Error('修改后的背包数量不能小于零');i.quantity=c.quantity;i.valueE=c.quantity===0?0:i.unitE==null?null:c.quantity*i.unitE;next.after.quantities[c.id]=after;}
    next.valueE=next.items.some(i=>i.valueE==null)?null:next.items.reduce((n,i)=>n+i.valueE,0);next.correctedAt=Date.now();
    const updateRows=snapshot=>{for(const [id,total]of Object.entries(next.after.quantities)){for(const field of ['rows','allRows','cells']){const rows=(snapshot[field]||[]).filter(c=>c.id===id&&!c.excluded);if(rows.length){rows.forEach((c,i)=>{c.quantity=i?0:total;c.quantityEdited=true;c.quantitySource='手动修正';});}}}snapshot.quantities=clone(next.after.quantities);};
    updateRows(next.after);if(s.baseline.imageHash===r.after.imageHash)updateRows(s.baseline);
    s.records[s.records.length-1]=next;return clone(next);
  }
  pause(at = Date.now()) {const s=this.current;if(!s) throw Error('未开始本轮');if(s.pausedAt == null)s.pausedAt=at;}
  correctBaseline(scan){
    const s=this.current;if(!s)throw Error('没有可修正的背包');
    if(!scan.allCellsReviewed||scan.scope!==s.scope||scan.season!==s.season)throw Error('修正背包范围或赛季不一致');
    const quantities=totals(scan.rows),snapshot={...clone(scan),quantities,at:s.baseline.at};delete snapshot.editingBaseline;
    const last=s.records.at(-1);if(last&&last.after.imageHash===s.baseline.imageHash){const before=last.before.quantities;last.items=[...new Set([...Object.keys(before),...Object.keys(quantities)])].map(id=>{const quantity=(quantities[id]||0)-(before[id]||0),price=last.prices.items.find(p=>p.id===id);const unitE=price&&Number.isFinite(price.valueE)&&price.valueE>0?price.valueE:null;return {id,quantity,unitE,valueE:quantity===0?0:unitE==null?null:quantity*unitE};});last.valueE=last.items.some(i=>i.valueE==null)?null:last.items.reduce((n,i)=>n+i.valueE,0);last.after=snapshot;}
    s.baseline=snapshot;return {corrected:true};
  }
  resume(at = Date.now()) {const s=this.current;if(!s)throw Error('未开始本轮');if(s.pausedAt != null){s.pausedMs+=at-s.pausedAt;s.pausedAt=null;}}
  addCost(cost, at=Date.now()) {
    const s=this.current;if(!s)throw Error('未开始本轮');
    if (!['inventory','extra'].includes(cost.mode) || !Number.isFinite(cost.quantity) || cost.quantity<=0 || !Number.isFinite(cost.unitE) || cost.unitE<0) throw Error('成本无效');
    const row={...clone(cost),id:randomUUID(),at,chargedE:cost.mode==='extra'?cost.quantity*cost.unitE:0};
    s.costs.push(row);return clone(row);
  }
  openMap(preset, at=Date.now()) {
    const s=this.current;if(!s)throw Error('请先保存一次背包，建立本轮记录');
    const checkpoint=clone(s);
    try {const batch=randomUUID();for(const c of preset)this.addCost({...c,batch},at);s.mapEntries??=[];s.mapEntries.push({batch,at});s.maps++;return batch;}
    catch(e){Object.assign(s,checkpoint);throw e;}
  }
  removeMap(){const s=this.current;if(!s||s.maps<=0)throw Error('当前地图数量已经是 0');const entry=s.mapEntries?.pop();if(entry)s.costs=s.costs.filter(c=>c.batch!==entry.batch);s.maps--;return {removed:true,refunded:Boolean(entry)};}
  undoScan() {const s=this.current;const r=s?.records.pop();if(!r)throw Error('没有可撤销的扫描');s.baseline=r.before;return r;}
  summary(s=this.current,at=Date.now()) {
    if(!s) return null;
    const ms=Math.max(0,(s.endedAt ?? s.pausedAt ?? at)-s.startedAt-s.pausedMs);
    const partialE=s.records.reduce((n,r)=>n+(r.valueE??0),0);
    const costsE=s.costs.reduce((n,c)=>n+c.chargedE,0);
    const netE=s.records.some(r=>r.valueE==null)?null:partialE-costsE;
    return {ms,maps:s.maps,partialE,costsE,netE,averageE:netE==null||s.maps===0?null:netE/s.maps,hourlyE:netE==null || ms===0?null:netE*3600000/ms};
  }
  end(at=Date.now()) {const s=this.current;if(!s)throw Error('未开始本轮');if(s.pausedAt!=null)this.resume(at);s.endedAt=at;return clone(s);}
}
module.exports={Ledger,totals};
