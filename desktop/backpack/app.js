'use strict';
const $=id=>document.getElementById(id),api=window.tracker;
let state,review=[],presetRows=[],presetEditing=false;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const number=v=>v==null?'待补价':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:3});
function money(v,rate=state?.prices.rateE){if(v==null)return '待补价';if(state?.settings.unit==='D'){if(!rate)return '汇率待确认';return number(v/rate)+' D';}return number(v)+' E';}
function amount(e,d){return state.settings.unit==='D'?(d==null?'待补价':number(d)+' D'):money(e);}
function sessionD(s){let d=0;for(const r of s.records){if(r.valueE==null||!r.prices.rateE)return null;d+=r.valueE/r.prices.rateE;}for(const c of s.costs){if(c.chargedE===0)continue;if(!c.rateE)return null;d-=c.chargedE/c.rateE;}return d;}
function date(at){return at==null?'—':new Date(at).toLocaleString('zh-CN',{hour12:false});}
function clock(ms){const sec=Math.floor(Math.max(0,ms)/1000);return [Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(v=>String(v).padStart(2,'0')).join(':');}
function activeTab(name){for(const n of document.querySelectorAll('.tab'))n.classList.toggle('active',n.id===name);for(const n of document.querySelectorAll('nav button'))n.classList.toggle('active',n.dataset.tab===name);}
async function call(action,p){try{const next=await api.call(action,p);if(next?.settings)render(next);return next;}catch(e){$('message').textContent=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');}}
function itemForName(name){return state.catalog.find(i=>i.name===name||i.id===name);}
function identity(name){const item=itemForName(name);return item?{id:item.id,name:item.name}:{id:'custom:'+name.trim(),name:name.trim()};}
function buildTable(items,rateE){const table=el('table'),head=el('tr');['物品 / 等级','数量变化','单价','合计'].forEach(t=>head.append(el('th',t)));table.append(head);for(const i of items.filter(i=>i.quantity!==0)){const tr=el('tr');const known=state.catalog.find(c=>c.id===i.id);[known?.name||i.name||i.id.replace(/^custom:/,''),(i.quantity>0?'+':'')+i.quantity,money(i.unitE,rateE),money(i.valueE,rateE)].forEach((t,j)=>tr.append(el('td',t,j===1?(i.quantity>0?'positive':'negative'):'')));table.append(tr);}return table;}
function render(s){state=s;$('message').textContent=s.message;$('pin').checked=s.settings.pin;$('unit').value=s.settings.unit;$('scan').textContent=s.busy?'正在识别……':`${s.settings.scanKey} 扫描背包`;$('scan').disabled=s.busy;$('map').textContent=`${s.settings.mapKey} 记录开图`;$('undo').disabled=!s.canUndo;
 const a=s.summary,session=s.current;$('net').textContent=a?amount(a.netE,a.netD):'—';$('hourly').textContent=a?amount(a.hourlyE,a.ms>0&&a.netD!=null?a.netD*3600000/a.ms:null):'—';$('partial').textContent=a?.netE==null&&a?'存在缺价，净收益尚未完整':'库存变化减额外成本';
 const records=session?.records||[];const positive=records.flatMap(r=>r.items).reduce((n,i)=>n+Math.max(0,i.valueE??0),0),loss=records.flatMap(r=>r.items).reduce((n,i)=>n-Math.min(0,i.valueE??0),0);
 const unknown=records.some(r=>r.valueE==null);let positiveD=0,lossD=0;for(const r of records){if(!r.prices.rateE){positiveD=null;lossD=null;break;}for(const i of r.items){positiveD+=Math.max(0,i.valueE??0)/r.prices.rateE;lossD-=Math.min(0,i.valueE??0)/r.prices.rateE;}}if(lossD!=null)for(const c of session?.costs||[]){if(c.chargedE===0)continue;if(!c.rateE){lossD=null;break;}lossD+=c.chargedE/c.rateE;}
 $('income').textContent=session?(unknown?'部分 ':'')+amount(positive,positiveD):'—';$('expense').textContent=session?(unknown?'部分 ':'')+amount(loss+(a?.costsE||0),lossD):'—';
 $('maps').textContent=a?.maps||0;$('pause').textContent=session?.pausedAt!=null?'继续':'暂停';$('pause').disabled=!session;$('end').disabled=!session;$('map').disabled=!session;$('times').textContent=session?`开始 ${date(session.startedAt)}　最近有效记录 ${date(session.baseline.at)}${session.pausedAt!=null?'　已暂停':''}`:'首次保存有效背包后开始计时。';
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());const today=s.daily[day];$('today').textContent=today?(today.unknown?'待补价':amount(today.netE,today.unknownD?null:today.netD)):'—';
 const latest=records.at(-1);$('changes').replaceChildren(latest?buildTable(latest.items,latest.prices.rateE):el('div','首次 F8 保存起始背包并开始计时。','empty'));$('deltaTime').textContent=latest?date(latest.at):'';
 $('pending').textContent=s.draft?s.draft.cells.filter(c=>!c.confirmed).length:0;$('reviewInfo').textContent=s.draft?date(s.draft.at):'没有待确认扫描';
 if(s.draft && review._hash!==s.draft.imageHash){review=structuredClone(s.draft.cells);review._hash=s.draft.imageHash;renderReview();}else if(!s.draft){review=[];$('reviewRows').replaceChildren(el('div','暂无待确认项目','empty'));}
 $('commit').disabled=!s.draft||s.busy;$('discard').disabled=!s.draft||s.busy;
 $('league').textContent='赛季 '+(s.prices.snapshot?.season||'待确认');$('exchange').textContent=s.prices.rateE?`1 D ≈ ${number(s.prices.rateE)} E（sell_avg）`:'D/E 缺少有效汇率';
 $('priceInfo').textContent=`poecurrency.top · ${s.prices.snapshot?date(s.prices.snapshot.fetchedAt):'未取得行情'}${s.prices.offline?' · 离线缓存':''}${s.prices.warning?' · '+s.prices.warning:''} · 接口 sell_avg 卖均价估算，非保证成交价 · 仅限个人非商业使用`;
 $('items').replaceChildren(...s.catalog.map(c=>{const option=el('option');option.value=c.name;return option;}));
 const old=$('presetSelect').value;$('presetSelect').replaceChildren(...Object.keys(s.presets).map(name=>{const o=el('option',name);o.value=name;return o;}));$('presetSelect').value=s.settings.preset;
 if(!presetEditing && old!==s.settings.preset)loadPreset();renderCosts();renderHistory();tick();}
function tick(){if(!state?.current){$('elapsed').textContent='00:00:00';return;}const s=state.current;const ms=Math.max(0,(s.pausedAt??Date.now())-s.startedAt-s.pausedMs);$('elapsed').textContent=clock(ms);const a=state.summary;if(a?.netE!=null)$('hourly').textContent=ms>0?amount(a.netE*3600000/ms,a.netD==null?null:a.netD*3600000/ms):'—';}
function textInput(value,placeholder){const input=el('input');input.value=value??'';input.placeholder=placeholder||'';return input;}
function numeric(value,handler){const input=textInput(value);input.type='number';input.min='0';input.step='1';input.placeholder='待核对';input.oninput=()=>handler(input.value===''?null:Number(input.value));return input;}
function label(title,input){const l=el('label',title);l.append(input);return l;}
function renderReview(){
 const parent=$('reviewRows');parent.replaceChildren();
 const groups=new Map();for(const c of review){const key=c.group??('cell-'+c.index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
 for(const [key,members]of groups){
  const first=members[0],panel=el('div',null,'review-group');panel.dataset.group=key;
  const head=el('div',null,'group-head'),img=el('img');img.src=first.icon;img.alt='物品截图';head.append(img);
  const title=el('div');title.append(el('strong',`同类物品 · ${members.length} 格`),el('small','仅合并相同图标与等级；各格数量分别保存。'));head.append(title);panel.append(head);
  const fields=el('div',null,'form-row');
  const commonName=members.every(c=>c.name===first.name)?first.name:'';
  const name=textInput(commonName,'输入一次物品名称，应用本组');name.setAttribute('list','items');
  const kind=el('select');for(const [value,title]of [['material','通货 / 材料'],['tablet','石板（右下角是次数）'],['map','引路石 / 地图'],['equipment','装备 / 不估价']]){const o=el('option',title);o.value=value;kind.append(o);}kind.value=first.kind||'material';
  const grade=textInput(first.grade,'等级（如 XV）');
  function changedIdentity(){for(const c of members){Object.assign(c,identity(name.value));c.kind=kind.value;c.grade=grade.value;c.confirmed=false;if(c.kind==='tablet'){c.remainingUses=c.bottomMark?.arabic??c.remainingUses;}}refreshChecks();saveDraftSoon();}
  name.oninput=changedIdentity;grade.oninput=changedIdentity;kind.onchange=()=>{changedIdentity();renderReview();};
  fields.append(label('物品名称（整组一次填写）',name),label('类别',kind),label('等级',grade));panel.append(fields);
  const controls=el('div',null,'actions');const single=el('button','本组每格 1 个并确认');single.onclick=()=>{
   if(!name.value.trim()){$('reviewError').textContent='请先填写本组名称。';name.focus();return;}
   for(const c of members){Object.assign(c,identity(name.value));c.kind=kind.value;c.grade=grade.value;c.quantity=1;c.confirmed=true;c.excluded=false;if(c.kind==='tablet')c.remainingUses=c.bottomMark?.arabic??c.remainingUses;}
   saveDraftSoon();renderReview();
  };
  const confirm=el('button','本组数量已核对，确认本组');confirm.onclick=()=>{
   if(!name.value.trim()||members.some(c=>!Number.isSafeInteger(c.quantity)||c.quantity<0)){$('reviewError').textContent='本组仍缺名称或数量；请填各格数量，单件物品可用“每格 1 个”。';return;}
   for(const c of members){Object.assign(c,identity(name.value));c.confirmed=true;c.excluded=false;c.kind=kind.value;c.grade=grade.value;}
   saveDraftSoon();renderReview();
  };
  const exclude=el('button','整组明确排除（装备等）');exclude.onclick=()=>{for(const c of members){c.excluded=true;c.confirmed=true;}saveDraftSoon();renderReview();};
  controls.append(single,confirm,exclude);panel.append(controls);
  const cells=el('div',null,'group-cells');
  for(const c of members){const cell=el('div',null,'group-cell'+(c.confirmed?' confirmed':''));cell.dataset.index=c.index;
   cell.append(el('small',`${c.area==='main'?'主背包':'扩展背包'} ${c.row}行${c.col}列${c.excluded?' · 已排除':''}`));
   const q=numeric(c.quantity,v=>{c.quantity=v;c.confirmed=false;refreshChecks();saveDraftSoon();});
   cell.append(label('物品数量',q));
   if(c.kind==='tablet'){const uses=numeric(c.remainingUses,v=>{c.remainingUses=v;c.confirmed=false;refreshChecks();saveDraftSoon();});cell.append(label('剩余使用次数',uses));}
   const check=el('input');check.type='checkbox';check.checked=c.confirmed;check.dataset.checkIndex=c.index;check.onchange=()=>{
    if(check.checked&&!c.excluded&&(!c.id||!Number.isSafeInteger(c.quantity)||c.quantity<0)){check.checked=false;$('reviewError').textContent='请先填名称和数量，或用整组单件确认。';return;}
    c.confirmed=check.checked;refreshChecks();saveDraftSoon();
   };const checkLabel=label('已核对',check);checkLabel.className='check';cell.append(checkLabel);cells.append(cell);
  }
  panel.append(cells);parent.append(panel);
 }
 if(!review.length)parent.append(el('p','当前背包为空；确认后保存空背包快照。','note'));
 refreshChecks();
}
function refreshChecks(){
 for(const c of review){const input=document.querySelector(`[data-check-index="${c.index}"]`);if(input)input.checked=c.confirmed;const node=document.querySelector(`.group-cell[data-index="${c.index}"]`);node?.classList.toggle('confirmed',c.confirmed);}
 const pending=review.filter(c=>!c.confirmed).length;$('pending').textContent=pending;
 $('commit').textContent=pending?`保存背包（还有 ${pending} 格待核对）`:'保存已核对背包';
}
let draftSaveTimer;
function saveDraftSoon(){clearTimeout(draftSaveTimer);draftSaveTimer=setTimeout(()=>{if(state?.draft)call('draftEdit',{hash:review._hash,cells:review});},250);}
async function saveReviewed(){
 clearTimeout(draftSaveTimer);const invalid=review.find(c=>!c.confirmed||(!c.excluded&&(!c.id||!Number.isSafeInteger(c.quantity)||c.quantity<0)));
 if(invalid){const count=review.filter(c=>!c.confirmed).length;$('reviewError').textContent=`尚未保存：还有 ${count} 格待核对。重复物品可填写一次名称，再使用整组确认按钮。`;const key=invalid.group??('cell-'+invalid.index);document.querySelector(`[data-group="${key}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});return;}
 $('reviewError').textContent='正在保存……';const result=await call('commit',review);if(result&&!result.draft){$('reviewError').textContent='保存成功';activeTab('overview');}else $('reviewError').textContent=$('message').textContent;
}

function loadPreset(){const name=state.settings.preset;$('presetName').value=name;presetRows=structuredClone(state.presets[name]||[]);presetEditing=false;renderPreset();}
function renderPreset(){const parent=$('presetRows');parent.replaceChildren();presetRows.forEach((c,i)=>{const row=el('div',null,'preset-row');const name=textInput(c.name,'物品或成本名称');name.className='name';name.setAttribute('list','items');name.oninput=()=>{Object.assign(c,identity(name.value));presetEditing=true;};const q=numeric(c.quantity,v=>{c.quantity=v;presetEditing=true;});q.step='any';const price=numeric(c.unitE,v=>{c.unitE=v;presetEditing=true;});price.step='any';const mode=el('select');for(const [value,title]of [['extra','额外计费'],['inventory','从库存变化统计']]){const o=el('option',title);o.value=value;mode.append(o);}mode.value=c.mode||'extra';mode.onchange=()=>{c.mode=mode.value;presetEditing=true;};const auto=el('input');auto.type='checkbox';auto.checked=Boolean(c.auto);auto.onchange=()=>{c.auto=auto.checked;presetEditing=true;};const remove=el('button','删除');remove.onclick=()=>{presetRows.splice(i,1);presetEditing=true;renderPreset();};row.append(label('项目',name),label('每图用量',q),label('手动单价 E',price),label('计费口径',mode),label('自动行情',auto),remove);parent.append(row);});}
function renderCosts(){const parent=$('costList');parent.replaceChildren();for(const c of state.current?.costs||[]){const row=el('div',null,'cost-entry');row.append(el('span',`${date(c.at)} · ${c.name||'临时支出'} × ${c.quantity} · ${c.mode==='inventory'?'库存已统计，额外扣除 0':money(c.chargedE,c.rateE)}`));const edit=el('button','修改');edit.onclick=()=>{edit.disabled=true;let qty=c.quantity,price=c.unitE;const q=numeric(qty,v=>qty=v),p=numeric(price,v=>price=v);q.step='any';p.step='any';const save=el('button','保存');save.onclick=()=>call('editCost',{...c,quantity:qty,unitE:price,auto:false});row.append(label('数量',q),label('单价 E',p),save);};row.append(edit);parent.append(row);}}
function renderHistory(){const daily=$('daily');daily.replaceChildren();for(const [day,v]of Object.entries(state.daily).sort().reverse())daily.append(el('p',`${day} · ${v.unknown?'待补价':amount(v.netE,v.unknownD?null:v.netD)} · ${v.maps} 图`,'note'));
 const parent=$('historyList');parent.replaceChildren();for(const s of [...state.sessions].reverse()){const details=el('details'),summary=el('summary');const unknown=s.records.some(r=>r.valueE==null);const net=unknown?null:s.records.reduce((n,r)=>n+r.valueE,0)-s.costs.reduce((n,c)=>n+c.chargedE,0);summary.textContent=`${date(s.startedAt)} · ${s.endedAt?'已结束':'进行中'} · ${s.maps} 图 · ${amount(net,sessionD(s))}`;details.append(summary);details.append(el('p',`基线 ${date(s.startedAt)}；最近 ${date(s.baseline.at)}；暂停累计 ${clock(s.pausedMs)}。`));for(const r of [...s.records].reverse()){const item=el('details');item.append(el('summary',`${date(r.at)} · 库存变化 ${money(r.valueE,r.prices.rateE)} · ${r.prices.basis||'价格快照'}`),buildTable(r.items,r.prices.rateE));details.append(item);}for(const c of s.costs)details.append(el('p',`${date(c.at)} 成本：${c.name||c.id} × ${c.quantity}；额外扣除 ${money(c.chargedE,c.rateE)}`));parent.append(details);}}
document.querySelectorAll('nav button').forEach(n=>n.onclick=()=>activeTab(n.dataset.tab));
$('scan').onclick=()=>call('scan');$('commit').onclick=saveReviewed;$('discard').onclick=()=>call('discard');$('map').onclick=()=>call('map');$('pause').onclick=()=>call('pause');$('end').onclick=()=>{if(confirm('结束本轮并保存到历史？'))call('end');};$('undo').onclick=()=>call('undo');$('pin').onchange=()=>call('pin',$('pin').checked);$('unit').onchange=()=>call('unit',$('unit').value);$('refresh').onclick=()=>call('refresh');
$('presetSelect').onchange=async()=>{presetEditing=false;await call('choosePreset',$('presetSelect').value);loadPreset();};$('newPreset').onclick=()=>{$('presetName').value='';presetRows=[];presetEditing=true;renderPreset();};$('addPresetRow').onclick=()=>{presetRows.push({id:'',name:'',quantity:1,unitE:0,mode:'extra',auto:false});presetEditing=true;renderPreset();};$('savePreset').onclick=async()=>{const result=await call('preset',{name:$('presetName').value,items:presetRows});if(result){presetEditing=false;loadPreset();}};
$('addCost').onclick=()=>{const name=$('costName').value.trim();if(!name){$('message').textContent='请填写成本名称';return;}call('cost',{...identity(name),quantity:Number($('costQuantity').value),unitE:$('costPrice').value,mode:$('costMode').value,currency:$('costCurrency').value,auto:$('costAuto').value==='auto'});};$('saveMaps').onclick=()=>call('mapCount',Number($('correctMaps').value));
$('reloadWindows').onclick=async()=>{const titles=await call('windows');if(!Array.isArray(titles))return;$('windowTitle').replaceChildren(...titles.map(t=>{const o=el('option',t);o.value=t;return o;}));$('windowTitle').value=state.settings.windowTitle;};$('saveSettings').onclick=()=>call('settings',{windowTitle:$('windowTitle').value,scanKey:$('scanKey').value.trim(),mapKey:$('mapKey').value.trim()});
$('saveManual').onclick=()=>call('manual',{...identity($('manualName').value),valueE:$('manualPrice').value});$('export').onclick=()=>call('export');$('restore').onclick=()=>{if(confirm('恢复后替换当前账本；恢复前会自动保存副本。继续？'))call('restore');};$('folder').onclick=()=>call('folder');
api.onUpdate(render);call('get').then(s=>{if(s){$('scanKey').value=s.settings.scanKey;$('mapKey').value=s.settings.mapKey;const o=el('option',s.settings.windowTitle);o.value=s.settings.windowTitle;$('windowTitle').append(o);loadPreset();}});setInterval(tick,1000);
