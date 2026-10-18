'use strict';
const {randomUUID}=require('node:crypto'),{Ledger}=require('../cn/ledger'),Audit=require('./scan-audit');
const clone=structuredClone;
const count=(s,tracked)=>unresolved(s,tracked).length+(s.modePending?1:0);
const selected=(c,tracked)=>!c.excluded&&(!c.id||!Array.isArray(tracked)||tracked.includes(c.id));
function unresolved(scan,tracked){return scan.cells.filter(c=>selected(c,tracked)&&Audit.needsReview(c));}
function summary(state){const q=state.pendingScans;if(!q)return {count:0,scans:[],heldIds:[]};return {count:q.scans.reduce((n,s)=>n+count(s,state.trackedIds),0),heldIds:held(q,state.trackedIds),scans:q.scans.map(s=>({id:s.pendingScanId,at:s.at,mode:s.scanMode||'compare',count:count(s,state.trackedIds),needsMode:Boolean(s.modePending),items:unresolved(s,state.trackedIds).map(c=>({name:c.name||'名称待识别',quantity:Number.isSafeInteger(c.quantity)?c.quantity:null,icon:c.icon}))}))};}
function holdStarts(q,tracked){const starts=new Map(),all=new Set(Object.keys(q.anchor?.baseline.quantities||{}));for(const s of q.scans)for(const c of s.cells)if(c.id&&selected(c,tracked))all.add(c.id);q.scans.forEach((s,index)=>{const unknown=s.modePending||unresolved(s,tracked).some(c=>!c.id),ids=unknown?all:unresolved(s,tracked).map(c=>c.id);for(const id of ids)if(!starts.has(id))starts.set(id,index);});return starts;}
function held(q,tracked){return [...holdStarts(q,tracked).keys()];}
function rows(scan,tracked,blocked){return scan.cells.filter(c=>selected(c,tracked)&&c.id&&!blocked.has(c.id)).map(c=>{if(!Number.isSafeInteger(c.quantity)||c.quantity<0)throw Error('待定扫描数量无效');return {id:c.id,name:c.name,grade:c.grade,kind:c.kind,quantity:c.quantity,confirmed:true};});}
function replay(state){
 const q=state.pendingScans;if(!q)return;
 const current=state.ledger.sessions.find(s=>s.id===q.sessionId),starts=holdStarts(q,state.trackedIds),base=q.anchor?clone(q.anchor):null;
 if(base){base.costs=[];base.incomes=[];if(Array.isArray(state.trackedIds)){base.baseline.rows=(base.baseline.rows||[]).filter(r=>state.trackedIds.includes(r.id));for(const id of Object.keys(base.baseline.quantities))if(!state.trackedIds.includes(id))delete base.baseline.quantities[id];}}
 const l=new Ledger({schema:1,sessions:base?[base]:[]});
 q.scans.forEach((s,index)=>{
  const blocked=new Set([...starts].filter(([,from])=>index>=from).map(([id])=>id)),actual=rows(s,state.trackedIds,blocked);
  // Once an item becomes uncertain, carry its last certain quantity. Earlier
  // confirmed gains remain visible; the affected tail is replayed on resolution.
  if(s.scanMode!=='empty')for(const id of blocked){const quantity=l.current?.baseline.quantities[id];if(quantity!=null)actual.push({id,name:id,quantity,confirmed:true});}
  const snap={...clone(s),cells:clone(s.cells),rows:actual,allRows:actual,allCellsReviewed:true};delete snap.pendingScanId;delete snap.editingBaseline;
  if(blocked.size)snap.imageHash='pending-projection:'+snap.imageHash;
  const beforeCount=l.current?.records.length||0;
  if(s.scanMode==='baseline')l.rebase(snap,s.prices,s.at);else if(s.scanMode==='empty')l.scanFromEmpty(snap,s.prices,s.at);else l.scan(snap,s.prices,s.at);
  if(l.current.records.length>beforeCount){const r=l.current.records.at(-1);s.recordId??=randomUUID();r.id=s.recordId;r.pendingScanId=s.pendingScanId;}
 });
 const computed=l.current;if(!computed)throw Error('待定扫描无法重建');
 if(current){current.records=computed.records;current.baseline=computed.baseline;current.rebases=computed.rebases||[];}
 else{computed.id=q.sessionId||randomUUID();q.sessionId=computed.id;state.ledger.sessions.push(computed);}
 if(!summary(state).count){const session=state.ledger.sessions.find(s=>s.id===q.sessionId);for(const r of session.records)delete r.pendingScanId;state.pendingScans=null;}
}
function defer(state,draft,accepted=false){if(!draft?.season||!draft.validPage||!draft.screenshot||!draft.imageHash)throw Error('扫描或赛季无效，无法暂存');const current=state.ledger.sessions.find(s=>!s.endedAt);if(current&&(current.scope!==draft.scope||current.season!==draft.season))throw Error('统计范围或赛季不一致');if(state.pendingScans&&state.pendingScans.sessionId!==current?.id)throw Error('待定扫描与本轮不一致');state.pendingScans??={sessionId:current?.id||null,anchor:current?{...clone(current),costs:[],incomes:[]}:null,scans:[]};const q=state.pendingScans,s=clone(draft);s.pendingScanId??=randomUUID();s.modePending=accepted?false:!s.scanMode||Boolean(s.modePending);s.scanMode||='compare';s.needsSaveDecision=false;s.needsDecreaseDecision=false;delete s.recordId;if(accepted)for(const c of s.cells)if(selected(c,state.trackedIds))c.reviewAccepted=true;const index=q.scans.findIndex(x=>x.pendingScanId===s.pendingScanId);if(index>=0){s.recordId=q.scans[index].recordId;q.scans[index]=s;}else q.scans.push(s);state.draft=null;replay(state);return s.pendingScanId;}
function comparison(state,id){const q=state.pendingScans;if(!q)return null;const index=id?q.scans.findIndex(s=>s.pendingScanId===id):q.scans.length,previous=q.scans[index-1];if(!previous)return q.anchor?.baseline?clone(q.anchor.baseline):null;const actual=previous.cells.filter(c=>selected(c,state.trackedIds)&&c.id&&Number.isSafeInteger(c.quantity)).map(c=>({id:c.id,name:c.name,quantity:c.quantity,confirmed:true})),quantities={};for(const r of actual)quantities[r.id]=(quantities[r.id]||0)+r.quantity;return {quantities,rows:actual,allRows:actual,imageHash:previous.imageHash};}
function open(state,id){const s=state.pendingScans?.scans.find(s=>s.pendingScanId===id);if(!s)throw Error('待定扫描已结算或不存在');if(state.draft&&state.draft.pendingScanId!==id)throw Error('请先暂存当前扫描');state.draft={...clone(s),comparisonBaseline:comparison(state,id),deferredSequence:true,needsSaveDecision:true,needsDecreaseDecision:true};}
function validate(state){const q=state.pendingScans;if(!q)return;if(!Array.isArray(q.scans)||!q.scans.length||!state.ledger.sessions.some(s=>s.id===q.sessionId&&!s.endedAt)||new Set(q.scans.map(s=>s.pendingScanId)).size!==q.scans.length)throw Error('待定扫描格式无效');for(const s of q.scans)if(!s.pendingScanId||!s.scope||!s.season||!s.imageHash||!s.screenshot||!Array.isArray(s.cells)||!Array.isArray(s.prices?.items)||!Number.isFinite(s.at)||!['compare','baseline','empty'].includes(s.scanMode))throw Error('待定截图或行情无效');}
module.exports={summary,replay,defer,open,unresolved,comparison,validate};
