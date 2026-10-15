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
    if (s?.pausedAt != null) throw Error('本轮已暂停，请继续后记录');
    if (s && (s.baseline.imageHash === scan.imageHash || JSON.stringify(s.baseline.quantities) === JSON.stringify(quantities))) return {duplicate:true};
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
  pause(at = Date.now()) {const s=this.current;if(!s) throw Error('未开始本轮');if(s.pausedAt == null)s.pausedAt=at;}
  resume(at = Date.now()) {const s=this.current;if(!s)throw Error('未开始本轮');if(s.pausedAt != null){s.pausedMs+=at-s.pausedAt;s.pausedAt=null;}}
  addCost(cost, at=Date.now()) {
    const s=this.current;if(!s)throw Error('未开始本轮');
    if (!['inventory','extra'].includes(cost.mode) || !Number.isFinite(cost.quantity) || cost.quantity<=0 || !Number.isFinite(cost.unitE) || cost.unitE<0) throw Error('成本无效');
    const row={...clone(cost),id:randomUUID(),at,chargedE:cost.mode==='extra'?cost.quantity*cost.unitE:0};
    s.costs.push(row);return clone(row);
  }
  openMap(preset, at=Date.now()) {
    const s=this.current;if(!s || s.pausedAt != null)throw Error('请先开始或继续本轮');
    const checkpoint=clone(s);
    try {const batch=randomUUID();for(const c of preset)this.addCost({...c,batch},at);s.maps++;return batch;}
    catch(e){Object.assign(s,checkpoint);throw e;}
  }
  undoScan() {const s=this.current;const r=s?.records.pop();if(!r)throw Error('没有可撤销的扫描');s.baseline=r.before;return r;}
  summary(s=this.current,at=Date.now()) {
    if(!s) return null;
    const ms=Math.max(0,(s.endedAt ?? s.pausedAt ?? at)-s.startedAt-s.pausedMs);
    const partialE=s.records.reduce((n,r)=>n+(r.valueE??0),0);
    const costsE=s.costs.reduce((n,c)=>n+c.chargedE,0);
    const netE=s.records.some(r=>r.valueE==null)?null:partialE-costsE;
    return {ms,maps:s.maps,partialE,costsE,netE,hourlyE:netE==null || ms===0?null:netE*3600000/ms};
  }
  end(at=Date.now()) {const s=this.current;if(!s)throw Error('未开始本轮');if(s.pausedAt!=null)this.resume(at);s.endedAt=at;return clone(s);}
}
module.exports={Ledger,totals};
