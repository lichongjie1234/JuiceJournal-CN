const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Ledger}=require('../cn/ledger');
const {normalize,quote,PriceService}=require('../cn/prices');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const snapshot=(quantity,hash=String(quantity))=>({validPage:true,scope:'normal/tab1',season:'test',imageHash:hash,screenshot:'saved.png',allCellsReviewed:true,rows:[{id:'x',quantity,confirmed:true}]});
test('uncertain scans never alter valid baseline; duplicate is ignored',()=>{
 const l=new Ledger();l.scan(snapshot(10),{},0);
 assert.throws(()=>l.scan({...snapshot(null),rows:[{id:'x',quantity:null,confirmed:false}]},{},1));
 assert.equal(l.current.baseline.quantities.x,10);
 assert.throws(()=>l.scan({...snapshot(12),scope:'other'},{},1));
 assert.deepEqual(l.scan(snapshot(10),{},2),{duplicate:true});
});
test('each comparison freezes one price; missing price retains quantities and unknown net',()=>{
 const l=new Ledger();l.scan(snapshot(10),{},0);
 const p={season:'test',items:[{id:'x',valueE:2}]};l.scan(snapshot(12),p,1000);p.items[0].valueE=99;
 assert.equal(l.current.records[0].valueE,4);assert.equal(l.current.records[0].prices.items[0].valueE,2);
 l.scan(snapshot(15),{season:'test',items:[]},2000);
 assert.equal(l.current.records[1].items[0].quantity,3);assert.equal(l.summary().netE,null);
 l.undoScan();assert.equal(l.current.baseline.quantities.x,12);
});
test('map costs exclude inventory deductions and paused time',()=>{
 const l=new Ledger();l.scan(snapshot(10),{},0);
 l.openMap([{mode:'inventory',quantity:1,unitE:2},{mode:'extra',quantity:1,unitE:3}],1000);
 l.scan(snapshot(9),{season:'test',items:[{id:'x',valueE:2}]},2000);
 l.pause(3000);l.resume(6000);l.end(9000);
 const s=l.summary(l.state.sessions[0]);assert.equal(s.ms,6000);assert.equal(s.maps,1);assert.equal(s.netE,-5);
});
test('failed map preset is atomic',()=>{
 const l=new Ledger();l.scan(snapshot(1),{},0);
 assert.throws(()=>l.openMap([{mode:'extra',quantity:1,unitE:1},{mode:'extra',quantity:0,unitE:1}]));
 assert.equal(l.current.costs.length,0);assert.equal(l.current.maps,0);
});
test('real API fixture preserves season, icon ambiguity and zero/missing prices',async()=>{
 const groups=JSON.parse(await fs.readFile(path.join(__dirname,'fixtures/summary.json'),'utf8'));
 const seasons=JSON.parse((await fs.readFile(path.join(__dirname,'fixtures/seasons.json'),'utf8')).replace(/^\uFEFF/,''));
 const s=normalize(groups,seasons);assert.equal(s.items.length,4);assert.equal(s.season,seasons[0]);
 const exalt=s.items.find(i=>i.english==='Exalted Orb');assert.ok(quote(s,exalt.id,'buy').reasons.includes('missing'));
 assert.ok(quote(s,exalt.id,'buy').reasons.includes('direction_unverified'));
 const grouped=Object.groupBy(s.items,i=>i.icon);assert.ok(Object.values(grouped).some(g=>g.length>1));
});
test('failed network uses cache with explicit offline warning',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'poe-price-test-'));
 try {await fs.writeFile(path.join(dir,'prices.json'),JSON.stringify({season:'old',items:[]}));
 const service=new PriceService(dir,async()=>{throw Error('offline');});const r=await service.sync();assert.equal(r.offline,true);assert.equal(r.warning,'offline');}
 finally {await fs.rm(dir,{recursive:true,force:true});}
});
