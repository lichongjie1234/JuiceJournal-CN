'use strict';const RecordPrices=require('./record-prices');
const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(at));
function summarize(sessions){
 const result={},add=(at,e,d)=>{const key=day(at),row=result[key]??={netE:0,netD:0,unknown:false,unknownD:false,maps:0};row.unknown||=e==null;row.unknownD||=d==null;row.netE+=e??0;row.netD+=d??0;};
 for(const s of sessions){
  for(const r of s.records){const e=r.valueE,rate=r.prices?.rateE;add(r.at??s.startedAt,e,RecordPrices.totalD(r));}
  for(const i of s.incomes||[])add(i.at??s.startedAt,i.valueE,i.valueD);
  for(const c of s.costs){const e=c.chargedE;add(c.at??s.startedAt,-e,e===0?0:c.rateE>0?-e/c.rateE:null);}
  for(const entry of s.mapEntries||[]){add(entry.at??s.startedAt,0,0);result[day(entry.at??s.startedAt)].maps++;}
 }
 return result;
}
module.exports={summarize};
