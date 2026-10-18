const {test}=require('node:test'),assert=require('node:assert/strict'),A=require('../backpack/scan-audit'),{Ledger}=require('../cn/ledger');
const cell=(id,quantity,extra={})=>({id,name:id,quantity,confirmed:true,...extra});
const draft=(cells)=>({cells,prices:{rateE:100,items:[{id:'orb',valueE:50},{id:'lost',valueE:100}]}});
test('preview uses snapshot prices and shows disappearing items and their negative amounts',()=>{
 const d=draft([cell('orb',5)]),before={quantities:{orb:3,lost:1},rows:[{id:'lost',name:'消失的物品'}]},copy=structuredClone(d),a=A.inspect(d,before,null);
 assert.equal(a.rows.find(r=>r.id==='orb').valueD,1);assert.equal(a.rows.find(r=>r.id==='lost').valueD,-1);assert.equal(a.decreased,1);assert.equal(a.valueD,0);assert.equal(a.changed,2);assert.deepEqual(d,copy);
});
test('first snapshot and stash rebase never present old inventory as earned income',()=>{
 const d=draft([cell('orb',8)]);assert.equal(A.inspect(d,null,null).valueD,0);assert.equal(A.inspect(d,{quantities:{orb:2}},null,'baseline').valueD,0);assert.equal(A.inspect(d,null,null,'empty').valueD,4);
});
test('missing prices remain unknown; estimates are separate from identity confirmation',()=>{
 const d=draft([cell('orb',5,{quantitySource:'单件估算'}),cell('unknown-price',1)]),a=A.inspect(d,{quantities:{orb:3}},null);
 assert.equal(a.estimated,1);assert.equal(a.blocked,0);assert.equal(a.missing,1);assert.equal(a.valueD,null);assert.equal(a.knownD,1);
});
test('unidentified items cannot disappear under a tracked-item filter',()=>{
 const d=draft([cell('',1,{notTracked:true}),cell('unselected',5)]),a=A.inspect(d,{quantities:{}},['orb']);assert.equal(a.unknown,1);assert.equal(a.blocked,1);assert.equal(a.ignored,1);assert.equal(a.duplicate,false);
});
test('duplicate all-income capture cannot rebase and double the same inventory',()=>{
 const l=new Ledger(),scan={validPage:true,scope:'backpack',season:'s',imageHash:'same',screenshot:'saved.png',allCellsReviewed:true,rows:[cell('orb',4)]},prices={season:'s',rateE:100,items:[{id:'orb',valueE:50}]};
 l.scanFromEmpty(scan,prices,1);const state=structuredClone(l.state);assert.deepEqual(l.scanFromEmpty(scan,prices,2),{duplicate:true});assert.deepEqual(l.state,state);
 assert.deepEqual(l.scanFromEmpty({...scan,imageHash:'new-pixels-same-count'},prices,3),{duplicate:true});assert.deepEqual(l.state,state);
});

test('all-income preview agrees with duplicate suppression in the ledger',()=>{
 const a=A.inspect(draft([cell('orb',4)]),{quantities:{orb:4}},null,'empty');assert.equal(a.valueD,0);assert.equal(a.duplicate,true);
});

test('audit explains stash possibility and suspicious jumps without changing booking amounts',()=>{
 const d=draft([cell('orb',50,{visualKey:'pixels'})]),b={quantities:{orb:2,lost:3},cells:[cell('lost',3,{visualKey:'pixels'})]},a=A.inspect(d,b,null),copy=structuredClone(a),w=A.warnings(a,b,d);
 assert(w.some(x=>x.type==='decrease'));assert(w.some(x=>x.type==='jump'));assert(w.some(x=>x.type==='identity'));assert.deepEqual(a,copy);
 assert(!A.warnings(A.inspect(d,b,null,'baseline'),b,d).some(x=>x.type==='decrease'));
});
