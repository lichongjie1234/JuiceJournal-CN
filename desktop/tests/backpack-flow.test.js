const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
function harness(initialFiles){
 const filename=path.resolve(__dirname,'../backpack/main.js'),realRequire=createRequire(filename),files=new Map(initialFiles||[['tile.png',Buffer.from('verified tile including stack digits')]]);
 const fakeFs={mkdirSync(){},existsSync:p=>files.has(p),readFileSync:(p,encoding)=>{if(!files.has(p))throw Error('missing');return encoding?files.get(p).toString(encoding):files.get(p);},writeFileSync:(p,v)=>files.set(p,Buffer.from(v)),copyFileSync:(a,b)=>files.set(b,files.get(a)),renameSync:(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
 const opened=[];const app={commandLine:{appendSwitch(){}},setPath(){},requestSingleInstanceLock:()=>false,quit(){},on(){},isReady:()=>false};
 const context={require:n=>n==='electron'?{app,globalShortcut:{unregisterAll(){}},shell:{openExternal:async url=>{opened.push(url);}}}:n==='node:fs'?fakeFs:realRequire(n),__dirname:path.dirname(filename),process:{argv:['node','--ui-test'],pid:1},structuredClone,Buffer,console,setTimeout,clearTimeout,setInterval};
 vm.createContext(context);vm.runInContext(fs.readFileSync(filename,'utf8')+'\nglobalThis.h={set:s=>state=s,get:()=>state,defaults,commit,enrichCell,action,imageDigest,automaticQuantity,learnCell};',context);return {...context.h,files,opened};
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
 const other=harness(),t=structuredClone(other.defaults);t.draft=draft(3,'a');other.set(t);other.commit(t.draft.cells);other.get().draft=draft(5,'b');other.get().draft.cells[0].confirmed=false;await other.action('end');assert.ok(other.get().pendingScans);assert.ok(other.get().draft);assert.equal(other.get().ledger.sessions[0].endedAt,undefined);
});
test('paused timer does not block backpack scans or change paused time',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);await h.action('pause');const pause=h.get().ledger.sessions[0].pausedAt;h.get().draft=draft(5,'b');h.commit(h.get().draft.cells);assert.equal(h.get().ledger.sessions[0].records[0].valueE,4);assert.equal(h.get().ledger.sessions[0].pausedAt,pause);
});
test('empty baseline counts entire selected backpack, stash baseline preserves prior earnings',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft={...draft(3,'a'),needsDecreaseDecision:true};h.set(s);await h.action('scanDecision','empty');assert.equal(h.get().ledger.sessions[0].records[0].valueE,6);h.get().draft={...draft(5,'b'),needsDecreaseDecision:true};await h.action('scanDecision','baseline');assert.equal(h.get().ledger.sessions[0].records.length,1);h.get().draft={...draft(7,'c'),needsDecreaseDecision:true};await h.action('scanDecision','compare');assert.equal(h.get().ledger.sessions[0].records[1].valueE,4);
});
test('map counter ignores retired presets, decrements correctly and refuses negative counts',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);s.presets['默认玩法']=[{id:'map',name:'测试成本',quantity:1,unitE:2,mode:'extra',auto:false}];h.get().presets=s.presets;await h.action('map');await h.action('map');assert.equal(h.get().ledger.sessions[0].costs.length,0);await h.action('mapMinus');assert.equal(h.get().ledger.sessions[0].maps,1);assert.equal(h.get().ledger.sessions[0].costs.length,0);await h.action('mapMinus');await assert.rejects(h.action('mapMinus'),/已经是 0/);
});
test('real screenshot empty count corners cannot become phantom five from zero-confidence OCR',()=>{const h=harness();h.set(structuredClone(h.defaults));for(const attempts of [[{text:'5',confidence:0}],[{text:'',confidence:0},{text:'5',confidence:0}]]){const c={id:'fragment',name:'危机碎片',quantity:null,topMark:{attempts}};h.automaticQuantity(c);assert.equal(c.quantity,1);assert.equal(c.quantitySource,'单件估算');}});
test('regex settings and presets persist separately from ledger, rejecting foreign storage keys',async()=>{const h=harness();h.set(structuredClone(h.defaults));const values={'shitu.settings.v1':JSON.stringify({version:1,tab:'tablet'}),'shitu.presets.v1':JSON.stringify({version:1,items:[]})};await h.action('regexStorage',values);assert.equal(h.get().regexStorage['shitu.settings.v1'],values['shitu.settings.v1']);assert.equal(h.get().ledger.sessions.length,0);await assert.rejects(h.action('regexStorage',{secret:'data'}),/无效/);});
test('rearranging unchanged items cannot create a zero-income history record',()=>{const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');s.draft.cells.push({...s.draft.cells[0],index:1,id:'other',name:'其他通货',quantity:2,visualKey:'other'});h.set(s);h.commit(s.draft.cells);h.get().draft=draft(3,'b');h.get().draft.cells.unshift({...h.get().draft.cells[0],index:1,id:'other',name:'其他通货',quantity:2,visualKey:'other'});h.commit(h.get().draft.cells);assert.equal(h.get().ledger.sessions[0].records.length,0);});
test('new accounting events do not retain retired full-ledger undo copies',()=>{const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'a');h.set(s);h.commit(s.draft.cells);h.get().draft=draft(5,'b');h.commit(h.get().draft.cells);assert.equal(h.get().undo.length,0);assert.equal(h.get().audit.length,2);assert.equal(h.get().ledger.sessions[0].records.length,1);});


test('manual D income survives missing exchange rates, archive and reload without changing inventory',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'income-baseline');h.set(s);h.commit(s.draft.cells);
 const before=structuredClone(h.get().ledger.sessions[0].baseline);
 let result=await h.action('income',{name:'额外收入',quantity:2,unitD:1.25});
 assert.equal(result.summary.netD,2.5);assert.equal(result.current.incomes[0].valueD,2.5);assert.deepEqual(h.get().ledger.sessions[0].baseline,before);assert.equal(result.current.records.length,0);
 const id=result.current.incomes[0].id;await assert.rejects(h.action('income',{name:'',quantity:1,unitD:1}));await assert.rejects(h.action('income',{name:'错误',quantity:1,unitD:-1}));
 h.set(structuredClone(h.get()));result=await h.action('get');assert.equal(result.summary.netD,2.5);
 result=await h.action('end');assert.equal(result.sessions[0].incomes[0].valueD,2.5);assert.equal(Object.values(result.daily)[0].netD,2.5);
 await assert.rejects(h.action('income',{name:'已结束',quantity:1,unitD:1}));
});
test('deleting manual income reverses net and preserves an audit row',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'income-delete');h.set(s);h.commit(s.draft.cells);
 let result=await h.action('income',{name:'手动补记',quantity:1,unitD:3});const id=result.current.incomes[0].id;
 result=await h.action('deleteIncome',id);assert.equal(result.summary.netD,0);assert.equal(result.current.incomes.length,0);assert.equal(result.current.deletedIncomes[0].valueD,3);await assert.rejects(h.action('deleteIncome',id));
});

test('resetting running or paused timer preserves income, maps, original start and inventory',async()=>{
 const {Ledger}=require('../cn/ledger'),l=new Ledger();l.scan({...draft(2,'timer'),rows:[{id:'orb',quantity:2,confirmed:true}],allCellsReviewed:true},{},1000);l.addIncome({name:'收入',quantity:1,unitD:3,rateE:100},1100);l.openMap([],1200);
 const baseline=structuredClone(l.current.baseline);l.resetTimer(5000);assert.equal(l.summary(undefined,6000).ms,1000);assert.equal(l.summary(undefined,6000).netE,300);assert.equal(l.current.startedAt,1000);assert.equal(l.current.maps,1);assert.deepEqual(l.current.baseline,baseline);
 l.pause(6500);l.resetTimer(7000);assert.equal(l.summary(undefined,8000).ms,0);l.resume(9000);assert.equal(l.summary(undefined,10000).ms,1000);assert.equal(l.current.timerResets.length,2);
});
test('preview correction is learned before booking and records why the recognition changed',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft={...draft(3,'preview'),needsDecreaseDecision:true};h.set(s);
 await h.action('draftEdit',{hash:'preview',cells:[{...s.draft.cells[0],quantity:8,quantityEdited:true,quantitySource:'手动修正'}]});assert.equal(h.get().ledger.sessions.length,0);assert.equal(h.get().draft.needsDecreaseDecision,true);assert.ok(h.get().audit.some(a=>a.reason==='堆叠数字识别修正'));
 const repeated={image:'tile.png',confirmed:false};await h.enrichCell(repeated,[]);assert.equal(repeated.quantity,8);assert.equal(repeated.confirmed,true);
});

test('blank corner correction never teaches a count to a different unreadable stack',()=>{
 const h=harness();h.set(structuredClone(h.defaults));const c={id:'orb',name:'通货',kind:'material',quantity:3,quantityEdited:true,confirmed:true,top:'tile.png',topInk:0,identitySignature:[10],badgeSignature:[0]};h.learnCell(c);
 const next={id:'orb',name:'通货',quantity:8,top:'tile.png',topInk:0};h.automaticQuantity(next);assert.equal(next.quantity,8);assert.equal(h.get().quantityCorrections,undefined);
});
test('an unknown item under selection stays blocked until corrected, then leaves ignored state',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.trackedIds=['orb'];s.draft=draft(3,'unknown-selected');s.draft.cells[0].id='';s.draft.cells[0].name='';s.draft.cells[0].notTracked=true;h.set(s);assert.throws(()=>h.commit(s.draft.cells));
 await h.action('draftEdit',{hash:s.draft.imageHash,cells:[{...s.draft.cells[0],id:'orb',name:'已修正',confirmed:true}]});assert.equal(h.get().draft.cells[0].notTracked,false);h.commit(h.get().draft.cells);assert.equal(h.get().ledger.sessions[0].baseline.quantities.orb,3);
});
test('saved receipt matches the booked frozen-price record and persists for review',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'receipt-first');s.draft.prices.rateE=100;h.set(s);h.commit(s.draft.cells);assert.equal(h.get().lastScanReceipt.baselineOnly,true);
 h.get().draft=draft(5,'receipt-second');h.get().draft.prices.rateE=100;h.get().draft.at=2000;h.commit(h.get().draft.cells);
 const receipt=h.get().lastScanReceipt,record=h.get().ledger.sessions[0].records[0];assert.equal(receipt.valueD,.04);assert.equal(receipt.recordId,record.id);const view=await h.action('get');assert.equal(view.receipt.valueD,.04);
});

test('cleared manual quantity stays an incomplete draft and cannot enter inventory',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'cleared-input');h.set(s);await h.action('draftEdit',{hash:s.draft.imageHash,cells:[{...s.draft.cells[0],quantity:null,quantityEdited:true,confirmed:false}]});assert.equal(h.get().draft.cells[0].quantity,null);assert.equal(h.get().ledger.sessions.length,0);assert.throws(()=>h.commit(h.get().draft.cells));
});

test('forget recognition action is blocked during review and preserves ledger after confirmation',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'memory-action');h.set(s);h.commit(s.draft.cells);const before=JSON.stringify(h.get().ledger),row=(await h.action('get')).recognitionMemory[0];h.get().draft=draft(3,'pending-memory');await assert.rejects(h.action('forgetRecognition',row.key),/当前扫描/);h.get().draft=null;await h.action('forgetRecognition',row.key);assert.equal(JSON.stringify(h.get().ledger),before);assert.equal((await h.action('get')).recognitionMemory.length,0);assert.equal(h.get().audit.at(-1).action,'忘记识别规则');
});

test('undo saved scan restores pre-scan state and allows a fresh scan without double booking',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'undo-base');h.set(s);await h.action('scanDecision','compare');h.get().draft=draft(5,'undo-next');await h.action('scanDecision','compare');assert.equal(h.get().ledger.sessions[0].records.length,1);const receipt=h.get().lastScanReceipt;assert((await h.action('get')).canUndo);await h.action('undo');assert.equal(h.get().ledger.sessions[0].records.length,0);assert.equal(h.get().ledger.sessions[0].baseline.quantities.orb,3);assert.equal(h.get().draft,null);assert.notEqual(h.get().lastScanReceipt.recordId,receipt.recordId);assert.equal((await h.action('get')).canUndo,false);h.get().draft=draft(5,'undo-rescan');await h.action('scanDecision','compare');assert.equal(h.get().ledger.sessions[0].records.length,1);assert.equal(h.get().ledger.sessions[0].records[0].valueE,4);
});
test('undo delete, archive, cost, map and correction restores accounting and rejects active draft',async()=>{
 const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'undo-baseline');h.set(s);h.commit(s.draft.cells);h.get().draft=draft(5,'undo-record');h.commit(h.get().draft.cells);const record=h.get().ledger.sessions[0].records[0],before=JSON.stringify(h.get().ledger);await h.action('deleteRecord',{sessionId:h.get().ledger.sessions[0].id,recordId:record.id});await h.action('undo');assert.equal(JSON.stringify(h.get().ledger),before);await h.action('map');await h.action('undo');assert.equal(h.get().ledger.sessions[0].maps,0);await h.action('cost',{name:'成本',quantity:1,unitE:3,mode:'extra'});await h.action('undo');assert.equal(h.get().ledger.sessions[0].costs.length,0);await h.action('editLatest',[{id:'orb',quantity:4}]);await h.action('undo');assert.equal(h.get().ledger.sessions[0].records[0].items[0].quantity,2);await h.action('end');await h.action('undo');assert.equal(h.get().ledger.sessions[0].endedAt,undefined);await h.action('map');h.get().draft=draft(6,'unfinished');await h.action('undo');assert.equal(h.get().draft,null);assert.equal(h.get().ledger.sessions[0].maps,1);
});
test('zero correction stays zero when exact reviewed pixels are recognized again',async()=>{const h=harness(),s=structuredClone(h.defaults);h.set(s);const c={...draft(0,'zero').cells[0],quantitySource:'手动修正'};h.learnCell(c);const next={image:'tile.png',quantity:null,confirmed:false};await h.enrichCell(next,[]);assert.equal(next.quantity,0);assert.equal(next.confirmed,true);});
test('failed save restores its decision flags and leaves the last successful undo point intact',async()=>{const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'atomic');h.set(s);h.commit(s.draft.cells);await h.action('map');h.get().draft={...draft(5,'bad-season'),season:'different',needsDecreaseDecision:true};await assert.rejects(h.action('scanDecision','empty'));assert.equal(h.get().draft.needsDecreaseDecision,true);assert.equal(h.get().ledger.sessions[0].maps,1);assert.equal(h.get().ledger.sessions[0].baseline.quantities.orb,3);});

test('last-operation checkpoint survives restart and window settings do not invalidate it',async()=>{const h=harness(),s=structuredClone(h.defaults);s.draft=draft(3,'restart-undo');h.set(s);h.commit(s.draft.cells);await h.action('map');const restarted=harness(h.files);assert.equal((await restarted.action('get')).canUndo,true);restarted.get().settings.miniOpacity=.6;await restarted.action('undo');assert.equal(restarted.get().ledger.sessions[0].maps,0);assert.equal(restarted.get().settings.miniOpacity,.6);});

test('lightweight floating data handles no session and does not show a deleted receipt',async()=>{const h=harness(),s=structuredClone(h.defaults);h.set(s);const empty=await h.action('getFloat');assert.equal(empty.active,false);assert.equal(empty.details.rows.length,0);s.draft=draft(3,'float-base');h.commit(s.draft.cells);h.get().draft={...draft(5,'float-next'),prices:{season:'test',rateE:100,items:[{id:'orb',valueE:2}]}};h.commit(h.get().draft.cells);const f=await h.action('getFloat');assert.equal(f.outputD,.04);assert(!('sessions' in f));assert(!('catalog' in f));const current=h.get().ledger.sessions[0];await h.action('deleteRecord',{sessionId:current.id,recordId:current.records[0].id});assert.equal((await h.action('getFloat')).status,'');});

test('same-image automatic correction keeps receipt linked to frozen original and supports undo',async()=>{const h=harness(),s=structuredClone(h.defaults);s.draft=draft(1,'correction-base');h.set(s);h.commit(s.draft.cells);h.get().draft=draft(3,'same-correction');h.get().draft.prices.rateE=100;h.commit(h.get().draft.cells);const id=h.get().ledger.sessions[0].records[0].id;h.get().draft=draft(5,'same-correction');h.get().draft.prices={season:'test',rateE:100,items:[{id:'orb',valueE:999}]};await h.action('scanDecision','compare');assert.equal(h.get().lastScanReceipt.recordId,id);assert.equal(h.get().lastScanReceipt.valueD,.08);assert.equal(h.get().ledger.sessions[0].records.length,1);await h.action('undo');assert.equal(h.get().ledger.sessions[0].baseline.quantities.orb,3);assert.equal(h.get().ledger.sessions[0].records[0].valueE,4);assert.equal(h.get().draft,null);});
test('saving tracked selection after disappeared-item correction preserves corrected baseline',async()=>{const h=harness(),s=structuredClone(h.defaults);s.trackedIds=['orb'];s.draft=draft(3,'gone-base');h.set(s);h.commit(s.draft.cells);h.get().draft={...draft(0,'gone-after'),cells:[]};h.commit([]);await h.action('editLatest',[{id:'orb',quantity:-1}]);await h.action('tracked',['orb']);assert.equal(h.get().ledger.sessions[0].baseline.quantities.orb,2);h.get().draft=draft(2,'gone-next');h.commit(h.get().draft.cells);assert.equal(h.get().ledger.sessions[0].records.length,1);assert.equal(h.get().ledger.sessions[0].records[0].valueE,-2);});

test('pending scans can be left until end, then confirmed chronologically into income',async()=>{const h=harness(),s=structuredClone(h.defaults);s.draft=draft(1,'deferred-base');h.set(s);h.commit(s.draft.cells);h.get().draft={...draft(3,'deferred-first'),scanMode:'compare'};h.get().draft.cells[0].quantitySource='单件估算';await h.action('defer');assert.equal((await h.action('get')).pendingScans.count,1);h.get().draft={...draft(5,'deferred-second'),scanMode:'compare'};h.files.set('tile-different.png',Buffer.from('different stack digits'));h.get().draft.cells[0].image='tile-different.png';await h.action('defer');assert.equal(h.get().ledger.sessions[0].records.length,0);await h.action('end');assert.ok(h.get().draft.pendingScanId);assert.equal(h.get().ledger.sessions[0].endedAt,undefined);await h.action('scanDecision','compare');assert.equal((await h.action('get')).pendingScans.count,0);assert.equal(h.get().ledger.sessions[0].records.reduce((n,r)=>n+r.valueE,0),8);await h.action('end');assert.ok(h.get().ledger.sessions[0].endedAt);});
test('undo deferred scan removes its booked known changes and allows rescan without an old draft',async()=>{const h=harness(),s=structuredClone(h.defaults);s.draft=draft(1,'defer-undo-base');h.set(s);h.commit(s.draft.cells);h.get().draft={...draft(3,'defer-undo'),scanMode:'compare'};h.get().draft.cells[0].quantitySource='单件估算';await h.action('defer');assert.ok(h.get().pendingScans);await h.action('undo');assert.equal(h.get().draft,null);assert.equal(h.get().pendingScans,undefined);assert.equal(h.get().ledger.sessions[0].baseline.quantities.orb,1);});

test('market favorites survive restart independently from ledger and clearRecords',async()=>{const h=harness(),s=structuredClone(h.defaults);h.set(s);const before=JSON.stringify(s.ledger),url='https://poe.game.qq.com/trade2/search/poe2/'+encodeURIComponent('周年庆巅峰挑战')+'/test-search';const result=await h.action('marketSave',{name:'刷图石板',url});assert.equal(result.market.items[0].name,'刷图石板');const restarted=harness(h.files);assert.equal((await restarted.action('get')).market.items.length,1);await restarted.action('clearRecords','all');assert.equal(restarted.get().market.items.length,1);assert.equal(JSON.stringify(h.get().ledger),before);await assert.rejects(h.action('marketSave',{name:'不支持',url:'https://example.com/'}));await assert.rejects(h.action('marketOpen',{id:'missing'}));await h.action('marketDelete',result.market.items[0].id);assert.equal(h.get().market.items.length,0);});


test('market opens only validated CN links and requires confirmation for an old season',async()=>{const h=harness();h.set(structuredClone(h.defaults));await h.action('marketOpen',{home:true});assert.equal(new URL(h.opened[0]).hostname,'poe.game.qq.com');const result=await h.action('marketSave',{name:'旧赛季石板',url:'https://poe.game.qq.com/trade2/search/poe2/old-league/abc'});const id=result.market.items[0].id;await assert.rejects(h.action('marketOpen',{id}),/旧赛季/);assert.equal(h.opened.length,1);await h.action('marketOpen',{id,allowOld:true});assert.equal(h.opened.length,2);});

test('watch configuration persists and rejects short intervals without touching income',async()=>{const h=harness();h.set(structuredClone(h.defaults));const token=require('node:zlib').gzipSync(JSON.stringify({status:{option:'securable'},type:'石板'})).toString('base64url'),url='https://poe.game.qq.com/trade2/search/poe2/'+encodeURIComponent('周年庆巅峰挑战')+'/'+token;const saved=await h.action('marketSave',{name:'石板',url}),id=saved.market.items[0].id,before=JSON.stringify(h.get().ledger);await assert.rejects(h.action('marketWatch',{id,seconds:5,thresholdD:.2,enabled:true}),/60/);await h.action('marketWatch',{id,seconds:120,thresholdD:.2,enabled:true});const restored=harness(h.files);assert.equal(restored.get().market.items[0].watch.seconds,120);assert.equal(restored.get().market.items[0].watch.enabled,true);assert.equal(JSON.stringify(h.get().ledger),before);await h.action('marketWatch',{id,seconds:120,thresholdD:.2,enabled:false});assert.equal(h.get().market.items[0].watch.enabled,false);});

test('floating alert is available without an active round and opens its validated search',async()=>{const h=harness(),s=structuredClone(h.defaults);h.set(s);assert.equal((await h.action('getFloat')).marketAlert,null);const url='https://poe.game.qq.com/trade2/search/poe2/'+encodeURIComponent('周年庆巅峰挑战')+'/alert-search';s.marketMonitor={alerts:[{id:'alert-one',name:'石板',priceD:27,at:1000,count:2,url}]};const before=JSON.stringify(s.ledger),v=await h.action('getFloat');assert.equal(v.active,false);assert.equal(v.marketAlert.priceD,27);assert.equal(v.marketAlert.oldSeason,false);await h.action('marketOpen',{alertId:v.marketAlert.id});assert.equal(h.opened[0],url);assert.equal(JSON.stringify(s.ledger),before);s.marketMonitor.alerts[0].url='https://poe.game.qq.com/trade2/search/poe2/old/abc';assert.equal((await h.action('getFloat')).marketAlert.oldSeason,true);await assert.rejects(h.action('marketOpen',{alertId:'alert-one'}),/旧赛季/);});
