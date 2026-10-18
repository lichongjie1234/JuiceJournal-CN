const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../backpack/rollback'),Daily=require('../backpack/daily-summary'),{Ledger}=require('../cn/ledger');
test('one checkpoint restores baseline, frozen prices, receipt and learning without reverting appearance',()=>{
 const s={ledger:{sessions:[{baseline:{quantities:{orb:2}},prices:{value:3}}]},draft:{imageHash:'draft'},learned:{old:1},settings:{miniOpacity:.7},audit:[]},before=R.capture(s);
 s.ledger.sessions[0].baseline.quantities.orb=8;s.draft=null;s.learned.new=2;s.lastScanReceipt={valueD:6};const entry=R.checkpoint(before,s,'保存扫描');assert(R.matches(entry,s));const persisted=JSON.parse(JSON.stringify(entry));s.settings.miniOpacity=.5;assert(R.matches(persisted,s));R.restore(s,persisted.before);assert.equal(s.ledger.sessions[0].baseline.quantities.orb,2);assert.equal(s.draft.imageHash,'draft');assert.equal(s.lastScanReceipt,undefined);assert.equal(s.learned.new,undefined);assert.equal(s.settings.miniOpacity,.5);assert.equal(R.checkpoint(R.capture(s),s,'no change'),null);
 s.ledger.sessions.push({});assert(!R.matches(entry,s));
});
test('daily profit follows each event time rather than the session archive date',()=>{
 const night=Date.parse('2026-10-17T23:58:00+08:00'),morning=Date.parse('2026-10-18T00:05:00+08:00'),s={startedAt:night,endedAt:morning,records:[{at:night,valueE:100,prices:{rateE:100}},{at:morning,valueE:300,prices:{rateE:100}}],incomes:[{at:morning,valueD:2,valueE:null}],costs:[{at:morning,chargedE:50,rateE:100}]},d=Daily.summarize([s]);assert.equal(d['2026-10-17'].netD,1);assert.equal(d['2026-10-18'].netD,4.5);assert.equal(d['2026-10-18'].unknownD,false);assert.equal(d['2026-10-18'].unknown,true);
});
test('invalid season cannot bypass validation through duplicate or empty baseline',()=>{
 const l=new Ledger(),scan={validPage:true,scope:'backpack',season:'s',imageHash:'same',screenshot:'image',allCellsReviewed:true,rows:[{id:'a',quantity:2,confirmed:true}]},prices={season:'s',items:[]};l.scan(scan,prices,1);const before=structuredClone(l.state);assert.throws(()=>l.scan(scan,{season:'old',items:[]},2));assert.throws(()=>l.scanFromEmpty({...scan,season:'other'},prices,3));assert.throws(()=>l.rebase(scan,{season:'old',items:[]},4));assert.deepEqual(l.state,before);assert.throws(()=>new Ledger().scan(scan,{season:'old',items:[]},1));
});
