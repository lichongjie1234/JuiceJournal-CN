'use strict';
const {app,BrowserWindow,ipcMain,globalShortcut,desktopCapturer,screen,dialog,shell}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');const {pathToFileURL}=require('node:url');
const {Ledger}=require('../cn/ledger');const {PriceService,normalize,quote}=require('../cn/prices');
const {acceptedMark}=require('../cn/ocr-marks');
app.commandLine.appendSwitch('force-device-scale-factor','1');
const ROOT=path.resolve(__dirname,'../..'),FIXTURE=process.argv.includes('--verify-fixture'),VERIFY=process.argv.includes('--verify-scan')||FIXTURE,DATA=path.join(ROOT,VERIFY?'validation/app-test-data':'data/backpack');
fs.mkdirSync(DATA,{recursive:true});app.setPath('userData',path.join(DATA,'electron'));
const FILE=path.join(DATA,'state.json');
const defaults={schema:2,ledger:{schema:1,sessions:[]},settings:{pin:false,unit:'E',scanKey:'F8',mapKey:'F9',windowTitle:'流放之路：降临',preset:'默认玩法'},presets:{'默认玩法':[]},learned:{},manual:{},audit:[],undo:[],draft:null};
let state=structuredClone(defaults),win,busy=false,worker,priceState={warning:'正在同步行情'},message='打开游戏背包后按 F8 扫描；黄色项目需核对。',service;
function persist(){const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state));if(fs.existsSync(FILE))fs.copyFileSync(FILE,FILE+'.bak');fs.renameSync(tmp,FILE);}
let recovered=false;
for(const file of [FILE,FILE+'.bak']){try{if(fs.existsSync(file)){const candidate=JSON.parse(fs.readFileSync(file));validate(candidate);state={...defaults,...candidate};recovered=file.endsWith('.bak');break;}}catch{recovered=true;}}
if(state.draft)for(const c of state.draft.cells){if(!c.id){c.candidateName ||= c.name;c.name='';}}
if(FIXTURE)state.draft=null;
function validate(s){if(s?.schema!==2 || !Array.isArray(s.ledger?.sessions)||!s.settings||!s.presets||!s.learned||!s.manual)throw Error('备份格式无效');new Ledger(s.ledger);for(const session of s.ledger.sessions){if(!Array.isArray(session.records)||!Array.isArray(session.costs)||!Number.isInteger(session.maps)||session.maps<0)throw Error('账本记录无效');}}
const ledger=()=>new Ledger(state.ledger);
function checkpoint(label){state.undo.push({label,ledger:structuredClone(state.ledger)});state.undo=state.undo.slice(-30);state.audit.push({at:Date.now(),action:label});}
function mutate(label,fn){const l=ledger();const result=fn(l);checkpoint(label);state.ledger=l.state;persist();return result;}
function rates(){const r=priceState.snapshot?.rates;const age=r?.at?Date.now()-Date.parse(r.at+'+08:00'):Infinity;return r&&!r.error&&Number.isFinite(r.sell)&&r.sell>0&&age>=-300000&&age<=86400000?r.sell:null;}
function historicalD(s){let total=0;for(const r of s.records){if(r.valueE==null||!r.prices.rateE)return null;total+=r.valueE/r.prices.rateE;}for(const c of s.costs){if(c.chargedE===0)continue;if(!c.rateE)return null;total-=c.chargedE/c.rateE;}return total;}
function priceSnapshot(){const s=priceState.snapshot;if(!s)return {season:state.ledger.sessions.find(x=>!x.endedAt)?.season||'未确认赛季',items:[]};
 const estimates={...s,directionVerified:true};
 // Explicitly estimate with the provider's sell_avg field; never invert quotes.
 const items=s.items.map(i=>({...quote(estimates,i.id,'sell'),name:i.name}));
 for(const [id,p] of Object.entries(state.manual)) {const j=items.findIndex(x=>x.id===id);const row={id,valueE:p.valueE,source:'手动单价',at:p.at,reasons:[]};if(j>=0)items[j]=row;else items.push(row);}
 const ex=s.items.find(i=>i.english==='Exalted Orb');if(ex){const row=items.find(i=>i.id===ex.id);row.valueE=1;row.reasons=[];row.source='E计价基准';}
 return {season:s.season,at:Date.now(),source:s.source,basis:'sell_avg：接口卖均价估算，非保证成交价',rateE:rates(),offline:priceState.offline||false,items};}
function catalog(){const items=priceState.snapshot?.items||[];return items.map(i=>({id:i.id,name:i.name,english:i.english}));}
function view(){const l=ledger(),current=l.current;const sessions=l.state.sessions;
 const daily={};for(const s of sessions){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(s.endedAt||s.startedAt));const a=l.summary(s),netD=historicalD(s);daily[day]??={netE:0,netD:0,unknown:false,unknownD:false,maps:0};daily[day].unknown ||= a.netE==null;daily[day].unknownD ||= netD==null;daily[day].netE+=a.netE??0;daily[day].netD+=netD??0;daily[day].maps+=s.maps;}
 const summary=l.summary();if(summary)summary.netD=historicalD(current);
 return {settings:state.settings,presets:state.presets,current,summary,sessions,daily,draft:state.draft,busy,message,prices:{...priceState,snapshot:priceState.snapshot?{season:priceState.snapshot.season,fetchedAt:priceState.snapshot.fetchedAt,source:priceState.snapshot.source}:null,rateE:rates()},catalog:catalog(),canUndo:state.undo.length>0};}
function emit(text){if(text)message=text;try{fs.writeFileSync(path.join(DATA,'runtime.json'),JSON.stringify({running:true,pid:process.pid,at:Date.now(),scanKey:state.settings.scanKey,scanRegistered:app.isReady()&&globalShortcut.isRegistered(state.settings.scanKey),mapRegistered:app.isReady()&&globalShortcut.isRegistered(state.settings.mapKey),busy,draft:Boolean(state.draft),message}));}catch{}if(win&&!win.isDestroyed())win.webContents.send('tracker:update',view());}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
async function syncPrices(){try{priceState=await service.sync();emit(priceState.offline?'行情同步失败，已使用缓存。':'国服行情已更新，历史估值保持原样。');}catch(e){priceState={...priceState,warning:e.message,offline:true};emit('暂未取得行情；可保存数量，估值将显示待补价。');}}
function python(args){return new Promise((resolve,reject)=>{const exe=path.join(ROOT,'runtime/python/python.exe');const child=spawn(exe,['-B',path.join(ROOT,'scripts/backpack-recognizer.py'),...args],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('识别超时，未修改有效库存'));},60000);child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);try{const result=JSON.parse(out);if(code||!result.validPage)throw Error(result.reason||err);resolve(result);}catch(e){reject(e);}});});}
async function ocr(file){if(!worker){const {createWorker}=require(path.join(ROOT,'desktop/cn/node_modules/tesseract.js'));worker=await createWorker('eng',1,{cachePath:path.join(ROOT,'cache'),langPath:path.join(ROOT,'cache'),gzip:false});}
 const attempts=[];for(const mode of ['7','8']){await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:'0123456789IVX'});const {data}=await worker.recognize(file);attempts.push({text:data.text.trim(),confidence:data.confidence});}return {...acceptedMark(attempts),attempts};}
async function scan(){if(busy)return;if(state.draft){emit('已有待确认扫描，请先保存或放弃，上一份有效库存未变。');return;}busy=true;emit('正在捕获游戏窗口并识别背包……');try{
 let bytes;
 if(FIXTURE)bytes=fs.readFileSync(path.join(ROOT,'validation/backpack-reopened.png'));
 else{const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:2560,height:1440}});
 const selected=sources.filter(s=>s.name===state.settings.windowTitle);if(selected.length!==1)throw Error('未找到唯一游戏窗口，请在设置中选择游戏窗口');
 const source=selected[0];if(source.thumbnail.isEmpty())throw Error('游戏窗口截图为空，未入账');bytes=source.thumbnail.toPNG();}
 const at=Date.now(),folder=path.join(DATA,'scans',`${at}-${randomUUID().slice(0,8)}`);fs.mkdirSync(folder,{recursive:true});const screenshot=path.join(folder,'window.png');fs.writeFileSync(screenshot,bytes);
 const result=await python([screenshot,folder,path.join(ROOT,'validation/backpack-open.png')]);
 const rows=result.cells.filter(c=>c.status!=='empty');const items=catalog();
 for(let i=0;i<rows.length;i++){const c=rows[i];c.icon=pathToFileURL(c.image).href;const learned=state.learned[c.visualKey];if(learned){Object.assign(c,learned);continue;}
 const found=items.find(x=>x.english.replace(/[^a-z0-9]/gi,'').toLowerCase()===(c.item||'').replace(/[^a-z0-9]/gi,'').toLowerCase());c.id=found?.id||'';c.name=found?.name||c.name;c.kind='material';
 c.topMark=await ocr(c.top);c.bottomMark=await ocr(c.bottom);
 // A bottom Arabic numeral can be tablet uses. Do not infer its semantics.
 c.quantity=c.topMark.arabic;c.remainingUses=null;c.grade=c.bottomMark.roman||'';
 c.candidateName=c.name;if(!found)c.name='';
 c.confirmed=Boolean(found && c.quantity!=null && !c.bottomMark.arabic && c.status==='recognized');
 if(i%5===0)emit(`正在识别 ${i+1}/${rows.length} 格；游戏焦点保持不变。`);
 }
 const imageHash=createHash('sha256').update(JSON.stringify(rows.map(c=>[c.area,c.row,c.col,c.visualKey]))).digest('hex');
 state.draft={...result,cells:rows,at,screenshot,imageHash,season:priceState.snapshot?.season||null,prices:priceSnapshot()};persist();
 if(rows.length&&rows.every(c=>c.confirmed))commit(rows);else emit(`扫描完成：${rows.filter(c=>!c.confirmed).length} 项待确认，未覆盖有效背包。`);
 }catch(e){emit('扫描未入账：'+e.message);}finally{busy=false;emit();}}
function commit(rows){const d=state.draft;if(!d)throw Error('没有待确认扫描');if(!d.season)throw Error('尚未确认国服赛季，请先同步价格');if(rows.length!==d.cells.length)throw Error('请核对所有非空格');
 const checked=rows.map((r,i)=>{const original=d.cells[i];if(r.index!==original.index)throw Error('格子顺序不一致');if(!r.confirmed)throw Error('仍有未确认格子');if(r.excluded)return {...original,...r};if(!r.id?.trim()||!Number.isSafeInteger(r.quantity)||r.quantity<0)throw Error('物品名称及数量必须明确');if(r.kind==='tablet' && r.remainingUses!=null && (!Number.isInteger(r.remainingUses)||r.remainingUses<0))throw Error('石板剩余次数无效');const row={...original,...r};if(row.id.startsWith('custom:')&&row.grade&&!row.name.endsWith(' '+row.grade)){row.name+=' '+row.grade;row.id='custom:'+row.name;}return row;});
 const result=mutate('确认背包扫描',l=>l.scan({...d,rows:checked.filter(c=>!c.excluded).map(c=>({id:c.id,name:c.name,grade:c.grade,quantity:c.quantity,remainingUses:c.remainingUses,kind:c.kind,confirmed:true})),allCellsReviewed:true},d.prices,d.at));
 for(const c of checked)state.learned[c.visualKey]={id:c.id,name:c.name,quantity:c.quantity,kind:c.kind,remainingUses:c.remainingUses,grade:c.grade,confirmed:true,excluded:Boolean(c.excluded)};
 state.draft=null;persist();emit(result.started?'起始背包已保存，本轮计时已开始。':result.duplicate?'背包未变化，已忽略重复记录。':'库存变化已记录；缺价项目保留数量，净收益显示待补价。');return result;}
function resolveCost(c){if(!['extra','inventory'].includes(c.mode))throw Error('请选择成本计费口径');const quantity=Number(c.quantity);if(!Number.isFinite(quantity)||quantity<=0)throw Error('成本数量必须大于0');let unitE;
 if(c.auto){unitE=priceSnapshot().items.find(i=>i.id===c.id)?.valueE;if(unitE==null)throw Error(`${c.name||'所选物品'}缺少有效行情，请填手动单价`);}else{unitE=Number(c.unitE);if(c.unitE==null||c.unitE===''||!Number.isFinite(unitE)||unitE<0)throw Error('请填写有效成本单价');}
 if(!c.auto&&c.currency==='D'){if(!rates())throw Error('缺少有效 D/E 汇率，请改用 E 金额');unitE*=rates();}
 return {...c,quantity,unitE,currency:'E',rateE:rates(),source:c.auto?'接口sell_avg':'手动',priceAt:Date.now()};}
function openMap(){if(busy)return;try{const preset=state.presets[state.settings.preset]||[];mutate('记录一次开图',l=>l.openMap(preset.map(resolveCost)));emit('已增加 1 图，并计入本玩法成本。');}catch(e){emit(e.message);}}
 function registerKeys(){globalShortcut.unregisterAll();const {scanKey,mapKey}=state.settings;if(!scanKey||!mapKey||scanKey===mapKey)throw Error('两个快捷键必须不同');const ok1=globalShortcut.register(scanKey,()=>{fs.appendFileSync(path.join(DATA,'hotkeys.jsonl'),JSON.stringify({at:Date.now(),key:scanKey,busy,draft:Boolean(state.draft)})+'\n');void scan();}),ok2=globalShortcut.register(mapKey,openMap);if(!ok1||!ok2)throw Error('快捷键被其他程序占用，请修改设置');}
async function action(action,p={}){try{
 switch(action){case 'get':return view();case 'scan':void scan();break;case 'commit':commit(p);break;case 'discard':if(busy)throw Error('扫描尚未结束');state.draft=null;persist();emit('已放弃待确认扫描，有效背包未变。');break;
 case 'draftEdit':{const d=state.draft;if(!d||d.imageHash!==p.hash||p.cells.length!==d.cells.length)throw Error('扫描草稿已改变');for(let i=0;i<d.cells.length;i++){const c=p.cells[i];if(c.index!==d.cells[i].index)throw Error('格子位置不一致');for(const key of ['id','name','quantity','remainingUses','kind','grade','confirmed','excluded'])d.cells[i][key]=c[key];}persist();break;}
 case 'refresh':void syncPrices();break;
 case 'pin':state.settings.pin=Boolean(p);win.setAlwaysOnTop(state.settings.pin);persist();break;
 case 'unit':state.settings.unit=p==='D'?'D':'E';persist();break;
 case 'pause':mutate('暂停或继续',l=>l.current?.pausedAt!=null?l.resume():l.pause());break;
 case 'end':if(state.draft)throw Error('请先处理待确认扫描');mutate('结束本轮',l=>l.end());break;
 case 'map':openMap();break;
 case 'mapCount':mutate('纠正地图数量',l=>{if(!l.current||!Number.isInteger(p)||p<0)throw Error('地图数量无效');l.current.maps=p;});break;
 case 'cost':mutate('追加成本',l=>l.addCost(resolveCost(p)));break;
 case 'editCost':mutate('修改成本',l=>{const s=l.current;if(!s)throw Error('没有本轮');const c=s.costs.find(c=>c.id===p.id);if(!c)throw Error('成本不存在');const edited=resolveCost(p);Object.assign(c,edited,{chargedE:edited.mode==='extra'?edited.quantity*edited.unitE:0});});break;
 case 'undo':{const old=state.undo.pop();if(!old)throw Error('没有可撤销记录');state.audit.push({at:Date.now(),action:'撤销 '+old.label});state.ledger=old.ledger;persist();break;}
 case 'preset':{if(!p.name?.trim()||!Array.isArray(p.items))throw Error('玩法预设无效');for(const c of p.items){if(!['extra','inventory'].includes(c.mode))throw Error('请选择计费口径');if(!Number.isFinite(Number(c.quantity))||Number(c.quantity)<=0)throw Error('每图用量无效');}state.presets[p.name.trim()]=p.items;state.settings.preset=p.name.trim();persist();break;}
 case 'choosePreset':if(!state.presets[p])throw Error('预设不存在');state.settings.preset=p;persist();break;
 case 'manual':if(!p.id||p.valueE===''||!Number.isFinite(Number(p.valueE))||Number(p.valueE)<=0)throw Error('单价必须大于0');state.manual[p.id]={valueE:Number(p.valueE),at:Date.now()};persist();break;
 case 'windows':return (await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1,height:1}})).map(s=>s.name);
 case 'settings':{const old={...state.settings};state.settings={...state.settings,...p};try{registerKeys();persist();}catch(e){state.settings=old;registerKeys();throw e;}break;}
 case 'export':{const result=await dialog.showSaveDialog(win,{defaultPath:path.join(ROOT,`背包收益备份-${Date.now()}.json`),filters:[{name:'JSON',extensions:['json']}]});if(!result.canceled)fs.writeFileSync(result.filePath,JSON.stringify(state,null,2));break;}
 case 'restore':{if(busy)throw Error('扫描过程中不能恢复');const result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(!result.canceled){const pth=result.filePaths[0];if(fs.statSync(pth).size>50000000)throw Error('备份过大');const candidate=readJson(pth);validate(candidate);fs.writeFileSync(FILE+'.before-restore',JSON.stringify(state));state={...defaults,...candidate,draft:null};persist();registerKeys();win.setAlwaysOnTop(Boolean(state.settings.pin));emit('备份已恢复；旧数据另存为 before-restore。');}break;}
 case 'folder':await shell.openPath(DATA);break;
 default:throw Error('未知操作');
 }emit();return view();
 }catch(e){emit(e.message);throw e;}}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{win?.show();});
 app.whenReady().then(async()=>{
 service=new PriceService(DATA);
 try{priceState={snapshot:readJson(path.join(DATA,'prices.json')),offline:true};}catch{try{priceState={snapshot:normalize(readJson(path.join(ROOT,'price-summary.raw.json')),readJson(path.join(ROOT,'season-list.raw.json'))),offline:true,warning:'使用随附缓存，正在检查更新'};}catch{}}
 const displays=screen.getAllDisplays(),primary=screen.getPrimaryDisplay(),secondary=displays.find(d=>d.id!==primary.id)||primary;
 let bounds=state.settings.bounds; if(!bounds||!displays.some(d=>bounds.x<d.bounds.x+d.bounds.width && bounds.x+bounds.width>d.bounds.x && bounds.y<d.bounds.y+d.bounds.height && bounds.y+bounds.height>d.bounds.y))bounds={x:secondary.workArea.x+30,y:secondary.workArea.y+30,width:1040,height:850};
 bounds={...bounds,width:Math.min(1240,Math.max(780,bounds.width)),height:Math.min(950,Math.max(620,bounds.height))};
 win=new BrowserWindow({...bounds,minWidth:780,minHeight:620,title:'POE2 国服背包收益',show:false,alwaysOnTop:Boolean(state.settings.pin),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setMenuBarVisibility(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.on('close',()=>{state.settings.bounds=win.getBounds();persist();});
 ipcMain.handle('tracker:action',(_e,a,p)=>action(a,p));await win.loadFile(path.join(__dirname,'index.html'));win.showInactive();
 if(recovered)emit('上次数据异常，已尝试恢复备份；请核对历史记录。');
 try{registerKeys();emit(`${state.settings.scanKey} 扫描 / ${state.settings.mapKey} 开图已就绪；请保持工具运行。`);}catch(e){emit(e.message);}
 void syncPrices();service.timer=setInterval(()=>void syncPrices(),3600000);
 if(VERIFY){
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
 app.on('will-quit',()=>{try{fs.writeFileSync(path.join(DATA,'runtime.json'),JSON.stringify({running:false,at:Date.now(),message:'工具已关闭，F8/F9 不再监听'}));}catch{}globalShortcut.unregisterAll();service?.stop();worker?.terminate();});app.on('window-all-closed',()=>app.quit());
}
