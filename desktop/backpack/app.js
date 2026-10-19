'use strict';
const $=id=>document.getElementById(id),api=window.tracker;
let state,review=[],hourlyKey;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const number=v=>v==null?'待补价':Number(v).toLocaleString('zh-CN',{maximumSignificantDigits:6});
function money(v,rate=state?.prices.rateE){if(v==null)return '待补价';if(!rate)return '汇率待确认';return number(v/rate)+' D';}
function amount(e,d){return d==null?'待补价':number(d)+' D';}
function sessionD(s){let d=(s.incomes||[]).reduce((n,i)=>n+i.valueD,0);for(const r of s.records){if(r.valueE==null||!r.prices.rateE)return null;d+=r.valueE/r.prices.rateE;}for(const c of s.costs){if(c.chargedE===0)continue;if(!c.rateE)return null;d-=c.chargedE/c.rateE;}return d;}
function date(at){return at==null?'—':new Date(at).toLocaleString('zh-CN',{hour12:false});}
function clock(ms){const sec=Math.floor(Math.max(0,ms)/1000);return [Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(v=>String(v).padStart(2,'0')).join(':');}
function closePickers(){document.querySelectorAll('[role="combobox"]').forEach(n=>n._itemPicker?.close());}
function attachPicker(input){return ItemPicker.attach(input,()=>state?.catalog||[]);}
function activeTab(name){closePickers();for(const n of document.querySelectorAll('.tab'))n.classList.toggle('active',n.id===name);for(const n of document.querySelectorAll('nav button'))n.classList.toggle('active',n.dataset.tab===name);if(name==='regex'&&state){try{RegexTool.mount({storage:state.regexStorage,save:value=>api.call('regexStorage',value),copy:value=>api.call('copyRegex',value),open:value=>call('openSource',value),error:text=>Workflow.feedback('正则方案保存失败：'+text,true)});}catch(e){Workflow.feedback('正则工具未能加载：'+e.message,true);}}}
async function call(action,p){try{if(action==='export'){await RegexTool.flush();await flushDraft();}const next=await api.call(action,p);if(next?.windowSettings){applyWindowSettings(next.windowSettings);return state;}if(next?.settings)render(next);if(next?.settings&&['end','editLatest','deleteRecord','clearRecords','tracked','pause','map','mapMinus','income','deleteIncome','resetTimer','undo'].includes(action))Workflow.feedback(next.message);return next;}catch(e){Workflow.feedback(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''),true);}}
function applyWindowSettings(settings){if(!state)return;if(JSON.stringify(state.settings)===JSON.stringify(settings))return;Object.assign(state.settings,settings);$('pin').checked=settings.pin;MiniPanel.render(state);}
function itemForName(name){const query=ItemPicker.normalize(name);return state.catalog.find(i=>ItemPicker.normalize(i.name)===query||i.id===name);}
function identity(name){if(!name.trim())return {id:'',name:''};const item=itemForName(name);return item?{id:item.id,name:item.name}:{id:'custom:'+name.trim(),name:name.trim()};}
function buildTable(items,rateE,before,editableRecord){
 const table=el('table'),head=el('tr'),showBefore=arguments.length>2,rows=items.filter(i=>i.quantity!==0);
 const labels=['物品 / 等级',...(showBefore?['上轮数量']:[]),'数量变化','单价','合计'];labels.forEach(t=>head.append(el('th',t)));table.append(head);
 for(const i of rows){const tr=el('tr'),known=state.catalog.find(c=>c.id===i.id),values=[known?.name||i.name||i.id.replace(/^custom:/,''),...(showBefore?[before?number(before[i.id]??0):'—']:[]),(i.quantity>0?'+':'')+i.quantity,money(i.unitE,rateE),money(i.valueE,rateE)];values.forEach((t,j)=>{const td=el('td',t,j===(showBefore?2:1)?(i.quantity>0?'positive':'negative'):'');if(editableRecord&&j===2){td.classList.add('editable-delta');td.dataset.deltaId=i.id;td.title='双击修改数量；回车或点击外部保存，Esc 取消';td.ondblclick=()=>inlineDelta(td,i,editableRecord);}tr.append(td);});table.append(tr);}
 if(showBefore){const total=el('tfoot'),tr=el('tr'),sum=key=>rows.some(i=>i[key]==null)?null:rows.reduce((n,i)=>n+i[key],0);['合计',before?number(rows.reduce((n,i)=>n+(before[i.id]??0),0)):'—',number(sum('quantity')),money(sum('unitE'),rateE),money(sum('valueE'),rateE)].forEach(t=>tr.append(el('td',t)));total.append(tr);table.append(total);}
 return table;
}
function inlineDelta(td,item,record){
 if(td.querySelector('input'))return;if(state.busy||state.draft){Workflow.feedback('请先保存或放弃待确认扫描，再修改已入账数量。',true);return;}
 const input=el('input');input.type='number';input.step='1';input.value=item.quantity;input.className='inline-delta-input';input.setAttribute('aria-label','修改数量变化');const original=td.textContent;let saving=false,done=false;td.replaceChildren(input);const cancel=()=>{done=true;td.textContent=original;};
 const save=async()=>{if(done||saving)return;if(!input.isConnected)return;if(state.current?.records.at(-1)?.id!==record.id){cancel();Workflow.feedback('记录已变化，请重新修改。',true);return;}const quantity=input.value===''?null:Number(input.value);if(!Number.isSafeInteger(quantity)){Workflow.feedback('数量必须是整数。',true);input.focus();return;}if(quantity===item.quantity){cancel();return;}saving=true;input._saving=true;const result=await call('editLatest',record.items.map(i=>({id:i.id,quantity:i.id===item.id?quantity:i.quantity})));saving=false;input._saving=false;if(result)done=true;else if(input.isConnected)input.focus();};input.onblur=save;input.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();cancel();}if(e.key==='Enter'){e.preventDefault();save();}};input.focus();input.select();
}
function render(s){state=s;$('message').textContent=s.message;$('pin').checked=s.settings.pin;$('revertLast').disabled=!s.canUndo;$('revertLast').title=s.draft?'取消这次扫描，回到可重新扫描状态':s.undoLabel?'撤回：'+s.undoLabel:'没有可撤回操作';$('scan').textContent=s.busy?'正在识别……':'扫描背包';$('scan').disabled=s.busy;$('map').textContent='记录开图';
 Workflow.render(s);MarketPanel.render(s);let pendingSummary=$('pendingSummary');if(!pendingSummary){pendingSummary=el('small',null,'pending-summary');pendingSummary.id='pendingSummary';$('partial').after(pendingSummary);}pendingSummary.hidden=!s.pendingScans?.count;pendingSummary.textContent=s.pendingScans?.count?`待定 ${s.pendingScans.count} 项 · 金额待确认，未计入以上收益`:'';renderReceipt(s);$('map').textContent='开图 +1';
 const excluded=$('exclusionList');excluded.replaceChildren();for(const rule of s.exclusions||[]){const row=el('div',null,'exclusion-entry'),remove=el('button','恢复统计');remove.onclick=()=>call('removeExclusion',rule.index);row.append(el('span',rule.name+(rule.grade?' '+rule.grade:'')),remove);excluded.append(row);}if(!s.exclusions?.length)excluded.append(el('p','尚无排除项。','note'));
 const a=s.summary,session=s.current;$('net').textContent=a?amount(a.netE,a.netD):'—';const nextHourlyKey=JSON.stringify([session?.id,session?.startedAt,session?.timerResetAt,session?.pausedAt,session?.pausedMs,a?.netD]);if(nextHourlyKey!==hourlyKey){hourlyKey=nextHourlyKey;refreshHourly();}$('partial').textContent=a?.netD==null&&a?'存在缺价，净收益尚未完整':'库存变化 + 意外收入 − 额外成本';
 const records=session?.records||[];const positive=records.flatMap(r=>r.items).reduce((n,i)=>n+Math.max(0,i.valueE??0),0),loss=records.flatMap(r=>r.items).reduce((n,i)=>n-Math.min(0,i.valueE??0),0);
 const estimated=session?.baseline.cells?.filter(c=>!c.excluded&&c.quantitySource?.includes('估算')).length||0;if(estimated)$('partial').textContent+=` · ${estimated} 格数量为估算，可点“修正最近背包数量”`;
 const unknown=records.some(r=>r.valueE==null);let positiveD=0,lossD=0;for(const r of records){if(!r.prices.rateE){positiveD=null;lossD=null;break;}for(const i of r.items){positiveD+=Math.max(0,i.valueE??0)/r.prices.rateE;lossD-=Math.min(0,i.valueE??0)/r.prices.rateE;}}if(lossD!=null)for(const c of session?.costs||[]){if(c.chargedE===0)continue;if(!c.rateE){lossD=null;break;}lossD+=c.chargedE/c.rateE;}
 if(positiveD!=null)positiveD+=(session?.incomes||[]).reduce((n,i)=>n+i.valueD,0);
 $('income').textContent=session?(unknown?'部分 ':'')+amount(positive,positiveD):'—';$('expense').textContent=session?(unknown?'部分 ':'')+amount(loss+(a?.costsE||0),lossD):'—';
 $('maps').textContent=a?.maps||0;$('pause').textContent=session?.pausedAt!=null?'继续计时':'暂停计时';$('pause').disabled=!session;$('resetTimer').disabled=!session;$('end').disabled=s.busy;$('map').disabled=!session||s.busy;$('mapMinus').disabled=!session||session.maps<=0||s.busy;$('averageMap').textContent=a&&a.maps>0?(a.netD==null?'待补价':number(a.netD/a.maps)+' D'):'—';$('times').textContent=session?`开始 ${date(session.startedAt)}　最近有效记录 ${date(session.baseline.at)}${session.pausedAt!=null?'　已暂停':''}`:'首次保存有效背包后开始计时。';
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());const today=s.daily[day];$('today').textContent=today?(today.unknownD?'待补价':amount(today.netE,today.unknownD?null:today.netD)):'—';
 const latest=records.at(-1),editing=document.activeElement;const preserveInline=editing?.classList.contains('inline-delta-input')&&!editing._saving&&$('changes').contains(editing)&&$('changes').dataset.recordId===latest?.id;if(!preserveInline)$('changes').replaceChildren(latest?buildTable(latest.items,latest.prices.rateE,latest.before?.quantities,latest):el('div',session?`起始背包已保存：${Object.keys(session.baseline.quantities||{}).length} 种物品。再次扫描后统计数量变化；起始库存不计为本轮产出。`:'首次保存有效背包后开始计时。','empty'));$('changes').dataset.recordId=latest?.id||'';$('deltaTime').textContent=latest?date(latest.at):session?'基线 '+date(session.baseline.at):'';
 $('pending').textContent=(s.pendingScans?.count||0)+(s.draft&&!s.draft.pendingScanId?s.draft.cells.filter(ScanAudit.needsReview).length:0);$('reviewInfo').textContent=s.draft?`已识别 ${s.draft.cells.filter(c=>c.confirmed).length} 格 · 待补全 ${s.draft.cells.filter(c=>!c.confirmed).length} 格 · 数量估算 ${s.draft.cells.filter(ScanAudit.estimated).length} 格`:'没有待确认扫描';
 if(s.draft && review._hash!==s.draft.imageHash){review=structuredClone(s.draft.cells);review._hash=s.draft.imageHash;$('showAllReview').checked=false;$('reviewDetails').open=false;Workflow.refreshPreview();$('reviewError').textContent='';renderReview();}else if(!s.draft){clearTimeout(draftSaveTimer);closePickers();review=[];$('reviewRows').replaceChildren(el('div','暂无待确认项目','empty'));$('reviewError').textContent='';refreshChecks();}
 $('commit').disabled=!s.draft||s.busy||review.some(c=>!c.confirmed)||s.draft.needsDecreaseDecision;$('discard').disabled=!s.draft||s.busy;$('discard').textContent=s.draft?.pendingScanId?'关闭核对（待定保留）':'放弃本次扫描';
 $('league').textContent='赛季 '+(s.prices.snapshot?.season||'待确认');$('exchange').textContent=s.prices.rateE?`1 D ≈ ${number(s.prices.rateE)} E（sell_avg）`:'D/E 缺少有效汇率';
 $('priceInfo').textContent=`poecurrency.top · ${s.prices.snapshot?date(s.prices.snapshot.fetchedAt):'未取得行情'}${s.prices.offline?' · 离线缓存':''}${s.prices.warning?' · '+s.prices.warning:''} · 接口 sell_avg 卖均价估算，非保证成交价 · 仅限个人非商业使用`;
 renderCosts();renderIncomes();renderHistory();tick();MiniPanel.render(s);}
function renderReceipt(s){const box=$('scanReceipt');box.replaceChildren();box.hidden=!s.receipt;if(!s.receipt)return;const r=s.receipt,text=r.duplicate?'背包未变化：没有重复入账。':r.baselineOnly?'已更新库存起点，本次不计收入。':`本次库存变化 ${r.valueD==null?'待补价（已知 '+number(r.knownD)+' D）':number(r.valueD)+' D'}${r.estimated?' · '+r.estimated+' 格数量为估算':''}`;box.append(el('span',date(r.at)+' · '+text));const evidence=el('button','原始截图');evidence.onclick=()=>call('scanEvidence','receipt');box.append(evidence);}
function tick(){if(!state?.current){$('elapsed').textContent='00:00:00';MiniPanel.sync();return;}const s=state.current;$('elapsed').parentElement.title=$('times').textContent+(s.timerResetAt?'；最近重置 '+date(s.timerResetAt):'');const ms=Math.max(0,(s.pausedAt??Date.now())-(s.timerResetAt??s.startedAt)-s.pausedMs);$('elapsed').textContent=clock(ms);MiniPanel.sync();}
function refreshHourly(){const s=state?.current,a=state?.summary;if(!s||a?.netD==null){$('hourly').textContent='—';MiniPanel.sync();return;}const ms=Math.max(0,(s.pausedAt??Date.now())-(s.timerResetAt??s.startedAt)-s.pausedMs);$('hourly').textContent=ms>0?amount(null,a.netD*3600000/ms):'—';MiniPanel.sync();}
function textInput(value,placeholder){const input=el('input');input.value=value??'';input.placeholder=placeholder||'';return input;}
function numeric(value,handler){const input=textInput(value);input.type='number';input.min='0';input.step='1';input.placeholder='待核对';input.oninput=()=>handler(input.value===''?null:Number(input.value));return input;}
function label(title,input){const l=el('label',title);l.append(input);return l;}
function renderReview(groupKey){
 const parent=$('reviewRows'),scoped=groupKey!==undefined;const original=scoped?[...parent.children].find(n=>n.dataset.group===String(groupKey)):null;const originalTop=original?.getBoundingClientRect().top,scrollBefore=window.scrollY;if(!scoped){closePickers();parent.replaceChildren();}
 const groups=new Map();for(const c of review){const key=c.group??('cell-'+c.index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
 for(const [key,members]of groups){
  if(scoped&&key!==groupKey)continue;
  if(!$('showAllReview').checked&&members.every(c=>!ScanAudit.needsReview(c)))continue;
  const first=members[0],panel=el('div',null,'review-group');panel.dataset.group=key;
  const head=el('div',null,'group-head'),img=el('img');img.src=first.icon;img.alt='物品截图';head.append(img);
  const complete=members.every(c=>!ScanAudit.needsReview(c));if(complete)panel.classList.add('complete');if(complete&&scoped)panel.classList.add('expanded');
  const title=el('div');title.append(el('strong',`${members.every(c=>c.notTracked)?'未纳入统计':complete?(members.every(c=>c.excluded)?'已排除':'已通过'):'待核对'} · ${first.name||'待识别物品'} · ${members.length} 格`),el('small',complete?'无需重复确认；数量分别保存。':'相同物品合并核对。'));head.append(title);if(complete){const edit=el('button','修改');edit.onclick=()=>panel.classList.toggle('expanded');head.append(edit);}panel.append(head);
  const fields=el('div',null,'form-row');
  const commonName=members.every(c=>c.name===first.name)?first.name:'';
  const name=textInput(commonName,'输入一次物品名称，应用本组');attachPicker(name);
  const kind=el('select');for(const [value,title]of [['material','通货 / 材料'],['tablet','石板（右下角是次数）'],['map','引路石 / 地图'],['equipment','装备 / 不估价']]){const o=el('option',title);o.value=value;kind.append(o);}kind.value=first.kind||'material';
  const grade=textInput(first.grade,'等级（如 XV）');
  function changedIdentity(){for(const c of members){Object.assign(c,identity(name.value));c.kind=kind.value;c.grade=grade.value;c.confirmed=Boolean(itemForName(name.value)&&Number.isSafeInteger(c.quantity));if(c.kind==='tablet'){c.remainingUses=c.bottomMark?.arabic??c.remainingUses;}}refreshChecks();saveDraftSoon();}
  name.oninput=changedIdentity;grade.oninput=changedIdentity;kind.onchange=()=>{changedIdentity();renderReview(key);};
  fields.append(label('物品名称（整组一次填写）',name),label('类别',kind),label('等级',grade));panel.append(fields);
  if(!commonName){const suggestions=el('div',null,'candidate-suggestions');const unique=new Set();for(const candidate of (first.candidates||[])){if(unique.has(candidate.id)||candidate.score<.85||unique.size>=3)continue;unique.add(candidate.id);const choose=el('button','可能是：'+candidate.name);choose.onclick=()=>{name.value=candidate.name;changedIdentity();if(members.every(c=>Number.isSafeInteger(c.quantity)&&c.quantity>0)){for(const c of members)c.confirmed=true;}saveDraftSoon();renderReview(key);};suggestions.append(choose);}panel.append(suggestions);}
  const controls=el('div',null,'actions');const single=el('button','本组每格 1 个并确认');single.onclick=()=>{
   if(!name.value.trim()){$('reviewError').textContent='请先填写本组名称。';name.focus();return;}
   for(const c of members){Object.assign(c,identity(name.value));c.kind=kind.value;c.grade=grade.value;c.quantity=1;c.confirmed=true;c.excluded=false;if(c.kind==='tablet')c.remainingUses=c.bottomMark?.arabic??c.remainingUses;}
   saveDraftSoon();renderReview(key);
  };
  if(kind.value==='material'&&members.some(c=>c.topMark?.arabic>1)){single.disabled=true;single.title='已识别到堆叠数量大于 1，请核对各格数量后确认本组';}
  const confirm=el('button','本组数量已核对，确认本组');confirm.onclick=()=>{
   if(!name.value.trim()||members.some(c=>!Number.isSafeInteger(c.quantity)||c.quantity<0)){$('reviewError').textContent='本组仍缺名称或数量；请填各格数量，单件物品可用“每格 1 个”。';return;}
   for(const c of members){Object.assign(c,identity(name.value));c.confirmed=true;c.excluded=false;c.kind=kind.value;c.grade=grade.value;}
   saveDraftSoon();renderReview(key);
  };
  const exclude=el('button','排除此类，下次自动忽略');exclude.onclick=()=>{for(const c of members){c.excluded=true;c.confirmed=true;}saveDraftSoon();renderReview(key);};
  controls.append(single,confirm,exclude);panel.append(controls);
  const cells=el('div',null,'group-cells');
  for(const c of members){const cell=el('div',null,'group-cell'+(c.confirmed?' confirmed':''));cell.dataset.index=c.index;
   cell.append(el('small',`${c.area==='main'?'主背包':'扩展背包'} ${c.row}行${c.col}列${c.excluded?' · 已排除':''}`));
   const q=numeric(c.quantity,v=>{c.quantity=v;c.quantityEdited=true;c.quantitySource='手动修正';c.quantityConflict=null;c.confirmed=Boolean(c.id&&c.name&&Number.isSafeInteger(v)&&v>=0);refreshChecks();saveDraftSoon();});
   cell.append(label('物品数量'+(c.quantitySource?' · '+c.quantitySource:''),q));
   if(c.quantityConflict){const warning=el('div',null,'quantity-conflict');warning.append(el('small',`截图读到 ${c.quantityConflict.recognized}，原先填写 ${c.quantityConflict.manual}`));const use=el('button','采用识别数量');use.onclick=()=>{c.quantity=c.quantityConflict.recognized;c.quantityConflict=null;c.confirmed=Boolean(c.id&&c.name);saveDraftSoon();renderReview(key);};const keep=el('button','保留手动数量');keep.onclick=()=>{c.overrideReadout=true;c.quantityConflict=null;c.confirmed=true;saveDraftSoon();renderReview(key);};warning.append(use,keep);cell.append(warning);}
   if(c.kind==='tablet'){const uses=numeric(c.remainingUses,v=>{c.remainingUses=v;c.confirmed=false;refreshChecks();saveDraftSoon();});cell.append(label('剩余使用次数',uses));}
   const check=el('input');check.type='checkbox';check.checked=c.confirmed;check.dataset.checkIndex=c.index;check.onchange=()=>{
    if(check.checked&&!c.excluded&&(!c.id||!Number.isSafeInteger(c.quantity)||c.quantity<0)){check.checked=false;$('reviewError').textContent='请先填名称和数量，或用整组单件确认。';return;}
    c.confirmed=check.checked;refreshChecks();saveDraftSoon();
   };const checkLabel=label('已核对',check);checkLabel.className='check';cell.append(checkLabel);cells.append(cell);
  }
  panel.append(cells);if(original)original.replaceWith(panel);else parent.append(panel);if(scoped)requestAnimationFrame(()=>{const delta=originalTop==null?0:panel.getBoundingClientRect().top-originalTop;window.scrollTo({top:Math.max(0,scrollBefore+delta),behavior:'instant'});});
 }
 if(!review.length)parent.append(el('p','当前背包为空；确认后保存空背包快照。','note'));
 refreshChecks();
}
function refreshChecks(){
 for(const c of review){const input=document.querySelector(`[data-check-index="${c.index}"]`);if(input)input.checked=c.confirmed;const node=document.querySelector(`.group-cell[data-index="${c.index}"]`);node?.classList.toggle('confirmed',c.confirmed);}
 const pending=review.filter(c=>!c.confirmed).length;$('pending').textContent=pending;
 $('commit').textContent=pending?`保存背包（还有 ${pending} 格待核对）`:'保存已核对背包';
 $('commit').hidden=!state?.draft?.editingBaseline;$('commit').disabled=!state?.draft||state.busy||pending>0||state.draft.needsDecreaseDecision;
 if(state?.draft)$('reviewInfo').textContent=`已识别 ${review.length-pending} 格 · 待补全 ${pending} 格 · 数量估算 ${review.filter(ScanAudit.estimated).length} 格`;
}
let draftSaveTimer,draftDirty=false;
let draftSavePromise=Promise.resolve();
function flushDraft(){clearTimeout(draftSaveTimer);if(!draftDirty||!state?.draft||review._hash!==state.draft.imageHash)return draftSavePromise;draftDirty=false;const payload={hash:review._hash,cells:structuredClone(review)};draftSavePromise=draftSavePromise.then(async()=>{const result=await call('draftEdit',payload);if(!result&&state?.draft?.imageHash===payload.hash)draftDirty=true;return result;});return draftSavePromise;}
function saveDraftSoon(){draftDirty=true;clearTimeout(draftSaveTimer);draftSaveTimer=setTimeout(flushDraft,250);}
async function saveReviewed(){
 if(state?.draft?.needsDecreaseDecision){activeTab('review');$('reviewError').textContent='请选择本次保存方式，再入账。';return;}
 clearTimeout(draftSaveTimer);await draftSavePromise;const invalid=review.find(c=>!c.confirmed||(!c.excluded&&!c.notTracked&&(!c.id||!Number.isSafeInteger(c.quantity)||c.quantity<0)));
 if(invalid){const count=review.filter(c=>!c.confirmed).length;$('reviewError').textContent=`尚未保存：还有 ${count} 格待核对。重复物品可填写一次名称，再使用整组确认按钮。`;const key=invalid.group??('cell-'+invalid.index);document.querySelector(`[data-group="${key}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});return;}
 $('reviewError').textContent='正在保存……';const result=await call('commit',review);if(result&&!result.draft){$('reviewError').textContent='保存成功';activeTab('overview');}else $('reviewError').textContent=$('message').textContent;
}

function renderCosts(){const parent=$('costList');parent.replaceChildren();for(const c of state.current?.costs||[]){const row=el('div',null,'cost-entry');row.append(el('span',`${date(c.at)} · ${c.name||'临时支出'} × ${c.quantity} · ${c.mode==='inventory'?'库存已统计，额外扣除 0':money(c.chargedE,c.rateE)}`));const edit=el('button','修改');edit.onclick=()=>{edit.disabled=true;let qty=c.quantity,price=c.rateE?c.unitE/c.rateE:null;const q=numeric(qty,v=>qty=v),p=numeric(price,v=>price=v);q.step='any';p.step='any';const save=el('button','保存');save.onclick=()=>call('editCost',{...c,quantity:qty,unitE:price,currency:'D',auto:false});row.append(label('数量',q),label('单价 D',p),save);};row.append(edit);parent.append(row);}}
function renderHistory(){HistoryPanel.render(state,{action:call,deleteButton:Workflow.deleteButton});}
function renderIncomes(){
 const parent=$('incomeList');parent.replaceChildren();$('addIncome').disabled=!state.current||state.busy;
 for(const i of [...(state.current?.incomes||[])].reverse()){const row=el('div',null,'cost-entry');row.append(el('span',`${date(i.at)} · ${i.name} × ${number(i.quantity)} · ${number(i.unitD)} D / 个 · 合计 ${number(i.valueD)} D`));const remove=el('button','删除');remove.onclick=()=>{remove.disabled=true;const text=el('span','确认删除这笔意外收入？'),yes=el('button','确认删除'),no=el('button','取消');yes.onclick=()=>call('deleteIncome',i.id);no.onclick=()=>{text.remove();yes.remove();no.remove();remove.disabled=false;};row.append(text,yes,no);};row.append(remove);parent.append(row);}
 if(!state.current)parent.append(el('p','先保存一次背包建立本轮，即可记录意外收入。','note'));
}
$('addIncome').onclick=async()=>{const name=$('incomeName').value.trim(),q=$('incomeQuantity').value,price=$('incomePrice').value;if(!name||q===''||price===''||!Number.isFinite(Number(q))||Number(q)<=0||!Number.isFinite(Number(price))||Number(price)<0){Workflow.feedback('请填写名称、正数数量和 D 单价。',true);return;}const button=$('addIncome');button.disabled=true;try{const next=await call('income',{name,quantity:Number(q),unitD:Number(price)});if(next){$('incomeName').value='';$('incomeQuantity').value='1';$('incomePrice').value='';}}finally{button.disabled=!state.current||state.busy;}};
attachPicker($('incomeName'));
document.querySelectorAll('nav button').forEach(n=>n.onclick=()=>activeTab(n.dataset.tab));
$('scan').onclick=async()=>{closePickers();await flushDraft();await call('scan');};$('commit').onclick=saveReviewed;$('discard').onclick=async()=>{closePickers();clearTimeout(draftSaveTimer);await draftSavePromise;await call('discard');};$('map').onclick=()=>call('map');$('mapMinus').onclick=()=>call('mapMinus');$('pause').onclick=()=>call('pause');$('pin').onchange=()=>call('pin',$('pin').checked);$('refresh').onclick=()=>call('refresh');$('revertLast').onclick=async()=>{closePickers();clearTimeout(draftSaveTimer);await draftSavePromise;await call('undo');};
$('addCost').onclick=()=>{const name=$('costName').value.trim();if(!name){$('message').textContent='请填写成本名称';return;}call('cost',{...identity(name),quantity:Number($('costQuantity').value),unitE:$('costPrice').value,mode:$('costMode').value,currency:$('costCurrency').value,auto:$('costAuto').value==='auto'});};$('saveMaps').onclick=()=>call('mapCount',Number($('correctMaps').value));
$('reloadWindows').onclick=async()=>{const titles=await call('windows');if(!Array.isArray(titles))return;$('windowTitle').replaceChildren(...titles.map(t=>{const o=el('option',t);o.value=t;return o;}));$('windowTitle').value=state.settings.windowTitle;};$('saveSettings').onclick=()=>call('settings',{windowTitle:$('windowTitle').value});
$('saveManual').onclick=()=>call('manual',{...identity($('manualName').value),valueE:$('manualPrice').value});$('export').onclick=()=>call('export');$('restore').onclick=()=>{if(confirm('恢复后替换当前账本；恢复前会自动保存副本。继续？'))call('restore');};$('folder').onclick=()=>call('folder');
$('showAllReview').onchange=()=>{closePickers();renderReview();Workflow.refreshPreview();};
$('costAuto').onchange=()=>{$('costPrice').disabled=$('costAuto').value==='auto';};$('costAuto').onchange();
$('reviewDetails').addEventListener('toggle',()=>{if($('reviewDetails').open&&state?.draft)renderReview();});
attachPicker($('costName'));attachPicker($('manualName'));attachPicker($('marketName'));MarketPanel.init({call,feedback:Workflow.feedback});
Workflow.init({action:call,tab:activeTab,flush:flushDraft,previewEdit:(indices,patch)=>{for(const c of review.filter(c=>indices.includes(c.index))){if(patch.name!=null){Object.assign(c,identity(patch.name));c.quantitySource=c.quantitySource||'原始识别';}if(Object.prototype.hasOwnProperty.call(patch,'quantity')){c.quantity=patch.quantity;c.quantityEdited=true;c.quantitySource='手动修正';}c.notTracked=Boolean(c.id&&Array.isArray(state.trackedIds)&&!state.trackedIds.includes(c.id));c.confirmed=Boolean(c.id&&Number.isSafeInteger(c.quantity)&&c.quantity>=0);const original=state.draft?.cells.find(x=>x.index===c.index);if(original)Object.assign(original,c);}refreshChecks();Workflow.refreshPreview();saveDraftSoon();}});MiniPanel.init({action:call,tab:activeTab,flush:flushDraft});api.onNavigate(activeTab);api.onWindowUpdate(applyWindowSettings);api.onUpdate(render);call('get').then(s=>{if(s){const o=el('option',s.settings.windowTitle);o.value=s.settings.windowTitle;$('windowTitle').append(o);}});setInterval(tick,1000);setInterval(refreshHourly,600000);
