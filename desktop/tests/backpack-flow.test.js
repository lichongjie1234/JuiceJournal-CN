const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
function harness(){
 const filename=path.resolve(__dirname,'../backpack/main.js'),realRequire=createRequire(filename),files=new Map([['tile.png',Buffer.from('verified tile including stack digits')]]);
 const fakeFs={mkdirSync(){},existsSync:p=>files.has(p),readFileSync:p=>{if(!files.has(p))throw Error('missing');return files.get(p);},writeFileSync:(p,v)=>files.set(p,Buffer.from(v)),copyFileSync:(a,b)=>files.set(b,files.get(a)),renameSync:(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
 const app={commandLine:{appendSwitch(){}},setPath(){},requestSingleInstanceLock:()=>false,quit(){},on(){},isReady:()=>false};
 const context={require:n=>n==='electron'?{app,globalShortcut:{unregisterAll(){}}}:n==='node:fs'?fakeFs:realRequire(n),__dirname:path.dirname(filename),process:{argv:['node','--ui-test'],pid:1},structuredClone,Buffer,console,setTimeout,clearTimeout,setInterval};
 vm.createContext(context);vm.runInContext(fs.readFileSync(filename,'utf8')+'\nglobalThis.h={set:s=>state=s,get:()=>state,defaults,commit,enrichCell,action,imageDigest,automaticQuantity,learnCell};',context);return context.h;
}
function draft(quantity,hash){return {validPage:true,scope:'backpack',season:'test',imageHash:hash,screenshot:'window.png',at:1000,prices:{season:'test',items:[{id:'orb',valueE:2}]},cells:[{index:0,visualKey:hash,id:'orb',name:'测试通货',quantity,confirmed:true,kind:'material',image:'tile.png',identitySignature:[10],badgeSignature:[0]}]};}
test('confirmed draft creates baseline, exact reviewed pixels bypass OCR, next quantity change books once',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'first');h.set(s);h.commit(s.draft.cells);
 assert.equal(h.get().draft,null);assert.equal(h.get().ledger.sessions[0].baseline.quantities.orb,3);
 const repeated={index:42,image:'tile.png',quantity:null,confirmed:false};await h.enrichCell(repeated,[]);assert.equal(repeated.quantity,3);assert.equal(repeated.confirmed,true);assert.equal(repeated.index,42);
 h.get().draft=draft(5,'second');h.get().draft.at=2000;h.commit(h.get().draft.cells);assert.equal(h.get().ledger.sessions[0].records[0].valueE,4);
 h.get().draft=draft(5,'third');h.commit(h.get().draft.cells);assert.equal(h.get().ledger.sessions[0].records.length,1);
});
test('draft confirmation is persisted before final commit and remains reusable after discard',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'draft');s.draft.cells[0].confirmed=false;h.set(s);
 await h.action('draftEdit',{hash:'draft',cells:[{...s.draft.cells[0],confirmed:true}]});assert.equal(Object.keys(h.get().exactReviewed).length,1);
 await h.action('discard');const repeated={image:'tile.png',confirmed:false};await h.enrichCell(repeated,[]);assert.equal(repeated.confirmed,true);assert.equal(repeated.quantity,3);assert.equal(h.get().ledger.sessions.length,0);
});
test('quantities are automatic; manual digit correction is reused for the same item',()=>{
 const h=harness();h.set(structuredClone(h.defaults));const c={id:'orb',name:'通货',quantity:null,top:'tile.png',topMark:{attempts:[{text:'8',confidence:62},{text:'',confidence:0}]}};h.automaticQuantity(c);assert.equal(c.quantity,8);assert.equal(c.confirmed,true);
 Object.assign(c,{quantity:3,quantityEdited:true,confirmed:true,identitySignature:[10],badgeSignature:[0]});h.learnCell(c);
 const next={id:'orb',name:'通货',quantity:8,top:'tile.png'};h.automaticQuantity(next);assert.equal(next.quantity,3);assert.equal(next.quantitySource,'已记住的手动修正');
 const other={id:'other',name:'其他',quantity:8,top:'tile.png'};h.automaticQuantity(other);assert.equal(other.quantity,8);
});
test('editing recorded quantities changes profit with original prices and never adds another scan',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'first');h.set(s);h.commit(s.draft.cells);
 h.get().draft=draft(5,'second');h.get().draft.at=2000;h.commit(h.get().draft.cells);
 await h.action('editBaseline');const d=h.get().draft;d.cells[0].quantity=4;d.cells[0].quantityEdited=true;h.commit(d.cells);
 const session=h.get().ledger.sessions[0];assert.equal(session.records.length,1);assert.equal(session.records[0].valueE,2);assert.equal(session.baseline.quantities.orb,4);assert.equal(session.startedAt,1000);assert.equal(session.baseline.at,2000);
});
test('stash-only scan preserves earned income and next scan uses the new baseline',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);h.get().draft=draft(5,'b');h.commit(h.get().draft.cells);
 h.get().draft={...draft(0,'stash'),scanMode:'baseline'};h.commit(h.get().draft.cells);let session=h.get().ledger.sessions[0];assert.equal(session.records.length,1);assert.equal(session.records[0].valueE,4);assert.equal(session.baseline.quantities.orb,0);
 h.get().draft=draft(2,'next');h.commit(h.get().draft.cells);session=h.get().ledger.sessions[0];assert.equal(session.records[1].valueE,4);
});
test('decrease decision blocks booking until user explicitly chooses comparison or rebase',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);h.get().draft={...draft(0,'stash'),needsDecreaseDecision:true};assert.throws(()=>h.commit(h.get().draft.cells),/选择/);await h.action('scanDecision','baseline');assert.equal(h.get().ledger.sessions[0].records.length,0);
});
test('editing latest delta preserves identity and original unit price, and does not touch a later stash baseline',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);h.get().draft=draft(5,'b');h.commit(h.get().draft.cells);h.get().draft={...draft(0,'stash'),scanMode:'baseline'};h.commit(h.get().draft.cells);
 await h.action('editLatest',[{id:'orb',quantity:4,unitE:999,name:'invalid'}]);const session=h.get().ledger.sessions[0];assert.equal(session.records[0].items[0].unitE,2);assert.equal(session.records[0].valueE,8);assert.equal(session.baseline.quantities.orb,0);assert.equal(session.records.length,1);
 await assert.rejects(h.action('editLatest',[{id:'fake',quantity:1}]));await assert.rejects(h.action('editLatest',[{id:'orb',quantity:-4}]));
});
test('tracked selection reprojects baseline without rewriting past income; clearing retains recognition memory',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);h.get().draft=draft(5,'b');h.commit(h.get().draft.cells);await h.action('tracked',[]);assert.equal(Object.keys(h.get().ledger.sessions[0].baseline.quantities).length,0);assert.equal(h.get().ledger.sessions[0].records[0].valueE,4);await h.action('tracked',['orb']);assert.equal(h.get().ledger.sessions[0].baseline.quantities.orb,5);
 const remembered=Object.keys(h.get().exactReviewed).length;await h.action('clearRecords','current');assert.equal(h.get().ledger.sessions.length,0);assert.equal(Object.keys(h.get().exactReviewed).length,remembered);assert.equal(h.get().trackedIds[0],'orb');
});
test('deleting any inventory record changes income but preserves next comparison baseline',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);h.get().draft=draft(5,'b');h.commit(h.get().draft.cells);h.get().draft=draft(7,'c');h.commit(h.get().draft.cells);let session=h.get().ledger.sessions[0],id=session.id,first=session.records[0].id;
 await h.action('deleteRecord',{sessionId:id,recordId:first});session=h.get().ledger.sessions[0];assert.equal(session.records.length,1);assert.equal(session.records[0].valueE,4);assert.equal(session.baseline.quantities.orb,7);assert.equal(session.deletedRecords[0].id,first);
 h.get().draft=draft(7,'same');h.commit(h.get().draft.cells);assert.equal(h.get().ledger.sessions[0].records.length,1);
 await h.action('end');assert.ok(h.get().ledger.sessions[0].endedAt);const last=h.get().ledger.sessions[0].records[0].id;await h.action('deleteRecord',{sessionId:id,recordId:last});assert.equal(h.get().ledger.sessions[0].records.length,0);
});
test('ending a run saves a complete draft then visibly archives it; uncertain drafts remain intact',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);h.get().draft=draft(5,'b');await h.action('end');assert.equal(h.get().draft,null);assert.equal(h.get().ledger.sessions[0].records.length,1);assert.ok(h.get().ledger.sessions[0].endedAt);
 const other=harness(),t=structuredClone(other.defaults);t.draft=draft(3,'a');other.set(t);other.commit(t.draft.cells);other.get().draft=draft(5,'b');other.get().draft.cells[0].confirmed=false;await assert.rejects(other.action('end'),/待处理/);assert.ok(other.get().draft);assert.equal(other.get().ledger.sessions[0].endedAt,undefined);
});
test('paused timer does not block backpack scans or change paused time',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);await h.action('pause');const pause=h.get().ledger.sessions[0].pausedAt;h.get().draft=draft(5,'b');h.commit(h.get().draft.cells);assert.equal(h.get().ledger.sessions[0].records[0].valueE,4);assert.equal(h.get().ledger.sessions[0].pausedAt,pause);
});
test('empty baseline counts entire selected backpack, stash baseline preserves prior earnings',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft={...draft(3,'a'),needsDecreaseDecision:true};h.set(s);await h.action('scanDecision','empty');assert.equal(h.get().ledger.sessions[0].records[0].valueE,6);h.get().draft={...draft(5,'b'),needsDecreaseDecision:true};await h.action('scanDecision','baseline');assert.equal(h.get().ledger.sessions[0].records.length,1);h.get().draft={...draft(7,'c'),needsDecreaseDecision:true};await h.action('scanDecision','compare');assert.equal(h.get().ledger.sessions[0].records[1].valueE,4);
});
test('map minus refunds only the latest map preset costs and refuses negative counts',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);s.presets['默认玩法']=[{id:'map',name:'测试成本',quantity:1,unitE:2,mode:'extra',auto:false}];h.get().presets=s.presets;await h.action('map');await h.action('map');assert.equal(h.get().ledger.sessions[0].costs.length,2);await h.action('mapMinus');assert.equal(h.get().ledger.sessions[0].maps,1);assert.equal(h.get().ledger.sessions[0].costs.length,1);await h.action('mapMinus');await assert.rejects(h.action('mapMinus'),/已经是 0/);
});
test('real screenshot empty count corners cannot become phantom five from zero-confidence OCR',()=>{const h=harness();h.set(structuredClone(h.defaults));for(const attempts of [[{text:'5',confidence:0}],[{text:'',confidence:0},{text:'5',confidence:0}]]){const c={id:'fragment',name:'危机碎片',quantity:null,topMark:{attempts}};h.automaticQuantity(c);assert.equal(c.quantity,1);assert.equal(c.quantitySource,'单件估算');}});
test('regex settings and presets persist separately from ledger, rejecting foreign storage keys',async()=>{const h=harness();h.set(structuredClone(h.defaults));const values={'shitu.settings.v1':JSON.stringify({version:1,tab:'tablet'}),'shitu.presets.v1':JSON.stringify({version:1,items:[]})};await h.action('regexStorage',values);assert.equal(h.get().regexStorage['shitu.settings.v1'],values['shitu.settings.v1']);assert.equal(h.get().ledger.sessions.length,0);await assert.rejects(h.action('regexStorage',{secret:'data'}),/无效/);});
test('rearranging unchanged items cannot create a zero-income history record',()=>{const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');s.draft.cells.push({...s.draft.cells[0],index:1,id:'other',name:'其他通货',quantity:2,visualKey:'other'});h.set(s);h.commit(s.draft.cells);h.get().draft=draft(3,'b');h.get().draft.cells.unshift({...h.get().draft.cells[0],index:1,id:'other',name:'其他通货',quantity:2,visualKey:'other'});h.commit(h.get().draft.cells);assert.equal(h.get().ledger.sessions[0].records.length,0);});
test('new accounting events do not retain retired full-ledger undo copies',()=>{const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);h.get().draft=draft(5,'b');h.commit(h.get().draft.cells);assert.equal(h.get().undo.length,0);assert.equal(h.get().audit.length,2);assert.equal(h.get().ledger.sessions[0].records.length,1);});
