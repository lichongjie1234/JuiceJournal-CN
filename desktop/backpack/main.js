'use strict';
const {app,BrowserWindow,ipcMain,globalShortcut,desktopCapturer,screen,dialog,shell,session,Notification}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');const {pathToFileURL}=require('node:url');
const {Ledger}=require('../cn/ledger');const {PriceService,normalize,quote}=require('../cn/prices');
const {acceptedMark,combineMarks}=require('../cn/ocr-marks');
const MarketSession=require('./market-session');const MarketMonitor=require('./market-monitor');const MarketClient=require('./market-client');const Market=require('./market');const Pending=require('./pending-scans');const Backup=require('./backup');const ProfitDetails=require('./profit-details');const FloatingWindows=require('./floating-window');const Daily=require('./daily-summary');const Rollback=require('./rollback');const WindowMode=require('./window-mode');const Memory=require('./recognition-memory');const Rules=require('./recognition-rules');const ScanAudit=require('./scan-audit');
app.commandLine.appendSwitch('force-device-scale-factor','1');if(process.platform==='win32')app.setAppUserModelId('POE2.CN.Backpack');
const ROOT=path.resolve(__dirname,'../..'),FIXTURE=process.argv.includes('--verify-fixture'),UI_TEST=process.argv.includes('--ui-test'),VERIFY=process.argv.includes('--verify-scan')||FIXTURE||UI_TEST,DATA=path.join(ROOT,UI_TEST?'validation/ui-test-data':VERIFY?'validation/app-test-data':'data/backpack');
fs.mkdirSync(DATA,{recursive:true});app.setPath('userData',path.join(DATA,'electron'));for(const [name,folder]of [['temp',path.join(ROOT,'cache','tmp')],['logs',path.join(DATA,'logs')],['crashDumps',path.join(DATA,'crashes')]]){fs.mkdirSync(folder,{recursive:true});app.setPath(name,folder);}
const FILE=path.join(DATA,'state.json');
const defaults={schema:2,ledger:{schema:1,sessions:[]},settings:{pin:false,unit:'E',scanKey:'F8',mapKey:'F9',windowTitle:'流放之路：降临',preset:'默认玩法'},presets:{'默认玩法':[]},learned:{},visualRules:[],exclusions:[],manual:{},audit:[],undo:[],draft:null};
let state=structuredClone(defaults),win,busy=false,worker,priceState={warning:'正在同步行情'},message='打开游戏背包后点击扫描；仅黄色项目需核对。',service,hotkeyHelper,hotkeyReady=false,floating,monitor,marketSession,quitting=false,statsVersion=0;
function persist(){statsVersion++;const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state));if(fs.existsSync(FILE))fs.copyFileSync(FILE,FILE+'.bak');fs.renameSync(tmp,FILE);}
let recovered=false;
for(const file of [FILE,FILE+'.bak']){try{if(fs.existsSync(file)){const candidate=JSON.parse(fs.readFileSync(file));validate(candidate);state={...defaults,...candidate};recovered=file.endsWith('.bak');break;}}catch{recovered=true;}}
state.settings.unit='D';state.settings.floatingVisible??=true;state.settings.miniMode=false;
if(state.undo.length){fs.copyFileSync(FILE,FILE+'.before-retired-undo-cleanup');state.undo=[];persist();}
if(state.draft)for(const c of state.draft.cells){if(!c.id){c.candidateName ||= c.name;c.name='';}}
if(FIXTURE)state.draft=null;
function validate(s){if(s?.schema!==2 || !Array.isArray(s.ledger?.sessions)||!s.settings||!s.presets||!s.learned||!s.manual)throw Error('备份格式无效');new Ledger(s.ledger);Pending.validate(s);Market.validate(s.market);MarketMonitor.validate(s.marketMonitor);for(const session of s.ledger.sessions){if(!Array.isArray(session.records)||!Array.isArray(session.costs)||!Number.isInteger(session.maps)||session.maps<0)throw Error('账本记录无效');}}
const ledger=()=>new Ledger(state.ledger);
const UNDO_FILE=path.join(DATA,'last-operation.json');let lastOperation=null,windowPersistTimer;
try{const saved=readJson(UNDO_FILE);if(Rollback.matches(saved,state))lastOperation=saved;}catch{}
function saveWindowSoon(){clearTimeout(windowPersistTimer);windowPersistTimer=setTimeout(()=>{if(win&&!win.isDestroyed())WindowMode.remember(win,state.settings);persist();},300);}
function windowReply(){const settings=structuredClone(state.settings);win?.webContents.send('tracker:window',settings);floating?.appearance();saveWindowSoon();return {windowSettings:settings};}
function saveOperation(entry){const tmp=UNDO_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(entry));fs.renameSync(tmp,UNDO_FILE);lastOperation=entry;}
function imageDigest(c){try{return createHash('sha256').update(fs.readFileSync(c.image)).digest('hex');}catch{return null;}}
function quantityKey(c){if(c.topInk===0||['tablet','map'].includes(c.kind))return null;const digest=imageDigest({image:c.topAlt||c.top});return c.id&&digest?c.id+':'+digest:null;}
function automaticQuantity(c){const key=quantityKey(c),corrected=key&&state.quantityCorrections?.[key];if(Number.isSafeInteger(corrected)){c.quantity=corrected;c.quantitySource='已记住的手动修正';}else if(!Number.isSafeInteger(c.quantity)||c.quantity<0){const reads=(c.topMark?.attempts||[]).filter(a=>a.confidence>=45&&/^[1-9]\d{0,5}$/.test(a.text)).sort((a,b)=>b.confidence-a.confidence);c.quantity=reads.length?Number(reads[0].text):1;c.quantitySource=reads.length?'自动读取（估算）':'单件估算';}else c.quantitySource||='自动读取';if(c.id&&c.name)c.confirmed=true;return c;}
function learnCell(c){const rule=Rules.ruleFor(c);if(!rule)return;const key=quantityKey(c);if(c.quantityEdited&&key&&!c.excluded){state.quantityCorrections??={};state.quantityCorrections[key]=c.quantity;}const digest=imageDigest(c);if(digest){state.exactReviewed??={};state.exactReviewed[digest]={id:c.id,name:c.name,quantity:c.quantity,kind:c.kind,remainingUses:c.remainingUses,grade:c.grade,quantitySource:c.quantitySource,reviewAccepted:Boolean(c.reviewAccepted),confirmed:true,excluded:Boolean(c.excluded)};}const target=c.excluded?state.exclusions:state.visualRules;const old=target.findIndex(r=>Rules.distance(r.signature,rule.signature)<.012&&Rules.distance(r.badge,rule.badge)<.025);if(old>=0)target[old]=rule;else target.push(rule);}
async function hydrateDraft(){const d=state.draft;if(!d?.screenshot||!fs.existsSync(d.screenshot)||d.recognitionVersion===3)return;try{
 const result=await python([d.screenshot,path.dirname(d.screenshot),path.join(ROOT,'validation/backpack-open.png')]);
 for(const c of d.cells){const found=result.cells.find(x=>x.index===c.index);if(found)for(const field of ['identitySignature','badgeSignature','group','top','topAlt','bottom','bottomAlt','topInk','bottomInk','bank','catalogId','item','status'])c[field]=found[field];}
 for(const c of d.cells)if(c.confirmed)learnCell(c);
 for(const c of d.cells)await enrichCell(c,catalog(),true);
 d.recognitionVersion=3;persist();
 }catch(e){message='旧扫描已保留，识别规则迁移未完成：'+e.message;fs.appendFileSync(path.join(DATA,'recognition-errors.log'),e.stack+'\n');}}
function checkpoint(label){state.audit.push({at:Date.now(),action:label});}
function mutate(label,fn){const l=ledger();const result=fn(l);checkpoint(label);state.ledger=l.state;persist();return result;}
function rates(){const r=priceState.snapshot?.rates;const age=r?.at?Date.now()-Date.parse(r.at+'+08:00'):Infinity;return r&&!r.error&&Number.isFinite(r.sell)&&r.sell>0&&age>=-300000&&age<=86400000?r.sell:null;}
function historicalD(s){let total=(s.incomes||[]).reduce((n,i)=>n+i.valueD,0);for(const r of s.records){if(r.valueE==null||!r.prices.rateE)return null;total+=r.valueE/r.prices.rateE;}for(const c of s.costs){if(c.chargedE===0)continue;if(!c.rateE)return null;total-=c.chargedE/c.rateE;}return total;}
function priceSnapshot(){const s=priceState.snapshot;if(!s)return {season:state.ledger.sessions.find(x=>!x.endedAt)?.season||'未确认赛季',items:[]};
 const estimates={...s,directionVerified:true};
 // Explicitly estimate with the provider's sell_avg field; never invert quotes.
 const items=s.items.map(i=>({...quote(estimates,i.id,'sell'),name:i.name}));
 for(const [id,p] of Object.entries(state.manual)) {const j=items.findIndex(x=>x.id===id);co…11977 tokens truncated…row-layout-'+page]=true;}
   fs.writeFileSync(path.join(ROOT,'validation/ui-regression.json'),JSON.stringify({passed:true,checks},null,2));
  }
  catch(error){fs.writeFileSync(path.join(ROOT,'validation/ui-regression.json'),JSON.stringify({passed:false,error:error.stack},null,2));}
  finally{await win.webContents.executeJavaScript('clearTimeout(draftSaveTimer);render({...state,draft:null})').catch(()=>{});app.quit();}
 }else if(VERIFY){
  try{await scan();const result={fixture:FIXTURE,draftCells:state.draft?.cells.length??0,pending:state.draft?.cells.filter(c=>!c.confirmed).length??0,startedSession:Boolean(ledger().current),message};
  if(state.draft)await win.webContents.executeJavaScript('activeTab("review")');
  await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const screenshot=await win.webContents.capturePage();fs.writeFileSync(path.join(ROOT,'validation/app-review.png'),screenshot.toPNG());
  fs.writeFileSync(path.join(ROOT,'validation/app-scan-test.json'),JSON.stringify(result,null,2));}
  finally{app.quit();}
 }else if(process.argv.includes('--smoke')){
  try{const result=await win.webContents.executeJavaScript('document.getElementById("scan").textContent');fs.writeFileSync(path.join(ROOT,'validation/app-smoke.json'),JSON.stringify({loaded:result.includes('扫描'),pin:win.isAlwaysOnTop(),bounds:win.getBounds(),shortcuts:globalShortcut.isRegistered(state.settings.scanKey)}));}
  finally{app.quit();}
 }
 });
 app.on('before-quit',()=>{quitting=true;monitor?.stop();marketSession?.close();floating?.remember();});
 app.on('will-quit',()=>{clearTimeout(windowPersistTimer);hotkeyHelper?.kill();try{fs.writeFileSync(path.join(DATA,'runtime.json'),JSON.stringify({running:false,at:Date.now(),message:'工具已关闭'}));}catch{}globalShortcut.unregisterAll();service?.stop();worker?.terminate();});app.on('window-all-closed',()=>app.quit());
}
