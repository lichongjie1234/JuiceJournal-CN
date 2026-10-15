'use strict';
const $=id=>document.getElementById(id),api=window.tracker;
let state,review=[],presetRows=[],presetEditing=false;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const number=v=>v==null?'待补价':Number(v).toLocaleString('zh-CN',{maximumSignificantDigits:6});
function money(v,rate=state?.prices.rateE){if(v==null)return '待补价';if(!rate)return '汇率待确认';return number(v/rate)+' D';}
function amount(e,d){return d==null?'待补价':number(d)+' D';}
function sessionD(s){let d=0;for(const r of s.records){if(r.valueE==null||!r.prices.rateE)return null;d+=r.valueE/r.prices.rateE;}for(const c of s.costs){if(c.chargedE===0)continue;if(!c.rateE)return null;d-=c.chargedE/c.rateE;}return d;}
function date(at){return at==null?'—':new Date(at).toLocaleString('zh-CN',{hour12:false});}
function clock(ms){const sec=Math.floor(Math.max(0,ms)/1000);return [Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(v=>String(v).padStart(2,'0')).join(':');}
function closePickers(){document.querySelectorAll('[role="combobox"]').forEach(n=>n._itemPicker?.close());}
function attachPicker(input){return ItemPicker.attach(input,()=>state?.catalog||[]);}
function activeTab(name){closePickers();for(const n of document.querySelectorAll('.tab'))n.classList.toggle('active',n.id===name);for(const n of document.querySelectorAll('nav button'))n.classList.toggle('active',n.dataset.tab===name);if(name==='regex'&&state){try{RegexTool.mount({storage:state.regexStorage,save:value=>api.call('regexStorage',value),copy:value=>api.call('copyRegex',value),open:value=>call('openSource',value),error:text=>Workflow.feedback('正则方案保存失败：'+text,true)});}catch(e){Workflow.feedback('正则工具未能加载：'+e.message,true);}}}
async function call(action,p){try{if(action==='export')await RegexTool.flush();const next=await api.call(action,p);if(next?.settings)render(next);if(next?.settings&&['end','editLatest','deleteRecord','clearRecords','tracked','pause','map','mapMinus'].includes(action))Workflow.feedback(next.message);return next;}catch(e){Workflow.feedback(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''),true);}}
function itemForName(name){const query=ItemPicker.normalize(name);return state.catalog.find(i=>ItemPicker.normalize(i.name)===query||i.id===name);}
function identity(name){if(!name.trim())return {id:'',name:''};const item=itemForName(name);return item?{id:item.id,name:item.name}:{id:'custom:'+name.trim(),name:name.trim()};}
function buildTable(items,rateE){const table=el('table'),head=el('tr');['物品 / 等级','数量变化','单价','合计'].forEach(t=>head.append(el('th',t)));table.append(head);for(const i of items.filter(i=>i.quantity!==0)){const tr=el('tr');const known=state.catalog.find(c=>c.id===i.id);[known?.name||i.name||i.id.replace(/^custom:/,''),(i.quantity>0?'+':'')+i.quantity,money(i.unitE,rateE),money(i.valueE,rateE)].forEach((t,j)=>tr.append(el('td',t,j===1?(i.quantity>0?'positive':'negative'):'')));table.append(tr);}return table;}
function render(s){state=s;$('message').textContent=s.message;$('pin').checked=s.settings.pin;$('scan').textContent=s.busy?'正在识别……':'扫描背包';$('scan').disabled=s.busy;$('map').textContent='记录开图';
 Workflow.render(s);$('map').textContent='记录开图 +1';
 const excluded=$('exclusionList');excluded.replaceChildren();for(const rule of s.exclusions||[]){const row=el('div',null,'exclusion-entry'),remove=el('button','恢复统计');remove.onclick=()=>call('removeExclusion',rule.index);row.append(el('span',rule.name+(rule.grade?' '+rule.grade:'')),remove);excluded.append(row);}if(!s.exclusions?.length)excluded.append(el('p','尚无排除项。','note'));
 const a=s.summary,session=s.current;$('net').textContent=a?amount(a.netE,a.netD):'—';$('hourly').textContent=a?amount(a.hourlyE,a.ms>0&&a.netD!=null?a.netD*3600000/a.ms:null):'—';$('partial').textContent=a?.netE==null&&a?'存在缺价，净收益尚未完整':'库存变化减额外成本';
 const records=session?.records||[];const positive=records.flatMap(r=>r.items).reduce((n,i)=>n+Math.max(0,i.valueE??0),0),loss=records.flatMap(r=>r.items).reduce((n,i)=>n-Math.min(0,i.valueE??0),0);
 const estimated=session?.baseline.cells?.filter(c=>!c.excluded&&c.quantitySource?.includes('估算')).length||0;if(estimated)$('partial').textContent+=` · ${estimated} 格数量为估算，可点“修正最近背包数量”`;
 const unknown=records.some(r=>r.valueE==null);let positiveD=0,lossD=0;for(const r of records){if(!r.prices.rateE){positiveD=null;lossD=null;break;}for(const i of r.items){positiveD+=Math.max(0,i.valueE??0)/r.prices.rateE;lossD-=Math.min(0,i.valueE??0)/r.prices.rateE;}}if(lossD!=null)for(const c of session?.costs||[]){if(c.chargedE===0)continue;if(!c.rateE){lossD=null;break;}lossD+=c.chargedE/c.rateE;}
 $('income').textContent=session?(unknown?'部分 ':'')+amount(positive,positiveD):'—';$('expense').textContent=session?(unknown?'部分 ':'')+amount(loss+(a?.costsE||0),lossD):'—';
 $('maps').textContent=a?.maps||0;$('pause').textContent=session?.pausedAt!=null?'继续计时':'暂停计时';$('pause').disabled=!session;$('end').disabled=s.busy;$('map').disabled=!session||s.busy;$('mapMinus').disabled=!session||session.maps<=0||s.busy;$('averageMap').textContent=a&&a.maps>0?(a.netD==null?'待补价':number(a.netD/a.maps)+' D'):'—';$('times').textContent=session?`开始 ${date(session.startedAt)}　最近有效记录 ${date(session.baseline.at)}${session.pausedAt!=null?'　已暂停':''}`:'首次保存有效背包后开始计时。';
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());const today=s.daily[day];$('today').textContent=today?(today.unknown?'待补价':amount(today.netE,today.unknownD?null:today.netD)):'—';
 const latest=records.at(-1);$('changes').replaceChildren(latest?buildTable(latest.items,latest.prices.rateE):el('div',session?`起始背包已保存：${Object.keys(session.baseline.quantities||{}).length} 种物品。再次扫描后统计数量变化；起始库存不计为本轮产出。`:'首次保存有效背包后开始计时。','empty'));$('deltaTime').textContent=latest?date(latest.at):session?'基线 '+date(session.baseline.at):'';
 $('pending').textContent=s.draft?s.draft.cells.filter(c=>!c.confirmed).length:0;$('reviewInfo').textContent=s.draft?`已通过 ${s.draft.cells.filter(c=>c.confirmed).length} 格 · 待核对 ${s.draft.cells.filter(c=>!c.confirmed).length} 格 · ${date(s.draft.at)}`:'没有待确认扫描';
 if(s.draft && review._hash!==s.draft.imageHash){review=structuredClone(s.draft.cells);review._hash=s.draft.imageHash;$('reviewError').textContent='';renderReview();}else if(!s.draft){clearTimeout(draftSaveTimer);closePickers();review=[];$('reviewRows').replaceChildren(el('div','暂无待确认项目','empty'));$('reviewError').textContent='';refreshChecks();}
 $('commit').disabled=!s.draft||s.busy||review.some(c=>!c.confirmed)||s.draft.needsDecreaseDecision;$('discard').disabled=!s.draft||s.busy;
 $('league').textContent='赛季 '+(s.prices.snapshot?.season||'待确认');$('exchange').textContent=s.prices.rateE?`1 D ≈ ${number(s.prices.rateE)} E（sell_avg）`:'D/E 缺少有效汇率';
 $('priceInfo').textContent=`poecurrency.top · ${s.prices.snapshot?date(s.prices.snapshot.fetchedAt):'未取得行情'}${s.prices.offline?' · 离线缓存':''}${s.prices.warning?' · '+s.prices.warning:''} · 接口 sell_avg 卖均价估算，非保证成交价 · 仅限个人非商业使用`;
 const old=$('presetSelect').value;const presetKey=Object.keys(s.presets).join('\n');if($('presetSelect').dataset.options!==presetKey){$('presetSelect').replaceChildren(...Object.keys(s.presets).map(name=>{const o=el('option',name);o.value=name;return o;}));$('presetSelect').dataset.options=presetKey;}$('presetSelect').value=s.settings.preset;
 if(!presetEditing && old!==s.settings.preset)loadPreset();renderCosts();renderHistory();tick();}
function tick(){if(!state?.current){$('elapsed').textContent='00:00:00';return;}const s=state.current;const ms=Math.max(0,(s.pausedAt??Date.now())-s.startedAt-s.pausedMs);$('elapsed').textContent=clock(ms);const a=state.summary;if(a?.netE!=null)$('hourly').textContent=ms>0?amount(a.netE*3600000/ms,a.netD==null?null:a.netD*3600000/ms):'—';}
function textInput(value,placeholder){const input=el('input');input.value=value??'';input.placeholder=placeholder||'';return input;}
function numeric(value,handler){const input=textInput(value);input.type='number';input.min='0';input.step='1';input.placeholder='待核对';input.oninput=()=>handler(input.value===''?null:Number(input.value));return input;}
function label(title,input){const l=el('label',title);l.append(input);return l;}
function renderReview(groupKey){
 const parent=$('reviewRows'),scoped=groupKey!==undefined;const original=scoped?[...parent.children].find(n=>n.dataset.group===String(groupKey)):null;const originalTop=original?.getBoundingClientRect().top,scrollBefore=window.scrollY;if(!scoped){closePickers();parent.replaceChildren();}
 const groups=new Map();for(const c of review){const key=c.group??('cell-'+c.index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
 for(const [key,members]of groups){
  if(scoped&&key!==groupKey)continue;
  const first=members[0],panel=el('div',null,'review-group');panel.dataset.group=key;
  const head=el('div',null,'group-head'),img=el('img');img.src=first.icon;img.alt='物品截图';head.append(img);
  const complete=members.every(c=>c.confirmed);if(complete)panel.classList.add('complete');if(complete&&scoped)panel.classList.add('expanded');
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
 $('commit').disabled=!state?.draft||state.busy||pending>0||state.draft.needsDecreaseDecision;
 if(state?.draft)$('reviewInfo').textContent=`已通过 ${review.length-pending} 格 · 待核对 ${pending} 格 · ${date(state.draft.at)}`;
}
let draftSaveTimer;
let draftSavePromise=Promise.resolve();
function flushDraft(){clearTimeout(draftSaveTimer);if(!state?.draft||review._hash!==state.draft.imageHash)return draftSavePromise;const payload={hash:review._hash,cells:structuredClone(review)};draftSavePromise=draftSavePromise.then(()=>call('draftEdit',payload));return draftSavePromise;}
function saveDraftSoon(){clearTimeout(draftSaveTimer);draftSaveTimer=setTimeout(flushDraft,250);}
async function saveReviewed(){
 if(state?.draft?.needsDecreaseDecision){activeTab('review');$('reviewError').textContent='请选择本次保存方式，再入账。';return;}
 clearTimeout(draftSaveTimer);await draftSavePromise;const invalid=review.find(c=>!c.confirmed||(!c.excluded&&!c.notTracked&&(!c.id||!Number.isSafeInteger(c.quantity)||c.quantity<0)));
 if(invalid){const count=review.filter(c=>!c.confirmed).length;$('reviewError').textContent=`尚未保存：还有 ${count} 格待核对。重复物品可填写一次名称，再使用整组确认按钮。`;const key=invalid.group??('cell-'+invalid.index);document.querySelector(`[data-group="${key}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});return;}
 $('reviewError').textContent='正在保存……';const result=await call('commit',review);if(result&&!result.draft){$('reviewError').textContent='保存成功';activeTab('overview');}else $('reviewError').textContent=$('message').textContent;
}

function loadPreset(){const name=state.settings.preset;$('presetName').value=name;presetRows=structuredClone(state.presets[name]||[]);presetEditing=false;renderPreset();}
function renderPreset(){const parent=$('presetRows');parent.replaceChildren();presetRows.forEach((c,i)=>{const row=el('div',null,'preset-row');const name=textInput(c.name,'物品或成本名称');name.className='name';attachPicker(name);name.oninput=()=>{Object.assign(c,identity(name.value));presetEditing=true;};const q=numeric(c.quantity,v=>{c.quantity=v;presetEditing=true;});q.step='any';const price=numeric(c.unitE,v=>{c.unitE=v;presetEditing=true;});price.step='any';const mode=el('select');for(const [value,title]of [['extra','额外计费'],['inventory','从库存变化统计']]){const o=el('option',title);o.value=value;mode.append(o);}mode.value=c.mode||'extra';mode.onchange=()=>{c.mode=mode.value;presetEditing=true;};const auto=el('input');auto.type='checkbox';auto.checked=Boolean(c.auto);auto.onchange=()=>{c.auto=auto.checked;presetEditing=true;};const remove=el('button','删除');remove.onclick=()=>{presetRows.splice(i,1);presetEditing=true;renderPreset();};row.append(label('项目',name),label('每图用量',q),label('手动单价 E',price),label('计费口径',mode),label('自动行情',auto),remove);parent.append(row);});}
function renderCosts(){const parent=$('costList');parent.replaceChildren();for(const c of state.current?.costs||[]){const row=el('div',null,'cost-entry');row.append(el('span',`${date(c.at)} · ${c.name||'临时支出'} × ${c.quantity} · ${c.mode==='inventory'?'库存已统计，额外扣除 0':money(c.chargedE,c.rateE)}`));const edit=el('button','修改');edit.onclick=()=>{edit.disabled=true;let qty=c.quantity,price=c.unitE;const q=numeric(qty,v=>qty=v),p=numeric(price,v=>price=v);q.step='any';p.step='any';const save=el('button','保存');save.onclick=()=>call('editCost',{...c,quantity:qty,unitE:price,auto:false});row.append(label('数量',q),label('单价 E',p),save);};row.append(edit);parent.append(row);}}
function renderHistory(){const daily=$('daily');daily.replaceChildren();for(const [day,v]of Object.entries(state.daily).sort().reverse())daily.append(el('p',`${day} · ${v.unknown?'待补价':amount(v.netE,v.unknownD?null:v.netD)} · ${v.maps} 图`,'note'));
 const parent=$('historyList');parent.replaceChildren();for(const s of [...state.sessions].reverse()){const details=el('details'),summary=el('summary');const unknown=s.records.some(r=>r.valueE==null);const net=unknown?null:s.records.reduce((n,r)=>n+r.valueE,0)-s.costs.reduce((n,c)=>n+c.chargedE,0);summary.textContent=`${date(s.startedAt)} · ${s.endedAt?'已结束':'进行中'} · ${s.maps} 图 · ${amount(net,sessionD(s))}`;details.append(summary);details.append(el('p',`基线 ${date(s.startedAt)}；最近 ${date(s.baseline.at)}；暂停累计 ${clock(s.pausedMs)}。`));for(const r of [...s.records].reverse()){const item=el('details');item.append(el('summary',`${date(r.at)} · 库存变化 ${money(r.valueE,r.prices.rateE)} · ${r.prices.basis||'价格快照'}`),buildTable(r.items,r.prices.rateE));item.querySelector('summary').append(Workflow.deleteButton(s,r));details.append(item);}for(const c of s.costs)details.append(el('p',`${date(c.at)} 成本：${c.name||c.id} × ${c.quantity}；额外扣除 ${money(c.chargedE,c.rateE)}`));parent.append(details);}}
document.querySelectorAll('nav button').forEach(n=>n.onclick=()=>activeTab(n.dataset.tab));
$('scan').onclick=async()=>{closePickers();await flushDraft();if(state.draft){const pending=review.filter(c=>!c.confirmed).length;if(pending){activeTab('review');$('reviewError').textContent=`还有 ${pending} 格需要核对；已核对的内容已保存，下次无需重填。`;return;}await saveReviewed();if(state.draft)return;}await call('scan');};$('commit').onclick=saveReviewed;$('discard').onclick=async()=>{closePickers();clearTimeout(draftSaveTimer);await draftSavePromise;await call('discard');};$('map').onclick=()=>call('map');$('mapMinus').onclick=()=>call('mapMinus');$('pause').onclick=()=>call('pause');$('pin').onchange=()=>call('pin',$('pin').checked);$('refresh').onclick=()=>call('refresh');
$('presetSelect').onchange=async()=>{presetEditing=false;await call('choosePreset',$('presetSelect').value);loadPreset();};$('newPreset').onclick=()=>{$('presetName').value='';presetRows=[];presetEditing=true;renderPreset();};$('addPresetRow').onclick=()=>{presetRows.push({id:'',name:'',quantity:1,unitE:0,mode:'extra',auto:false});presetEditing=true;renderPreset();};$('savePreset').onclick=async()=>{const result=await call('preset',{name:$('presetName').value,items:presetRows});if(result){presetEditing=false;loadPreset();}};
$('addCost').onclick=()=>{const name=$('costName').value.trim();if(!name){$('message').textContent='请填写成本名称';return;}call('cost',{...identity(name),quantity:Number($('costQuantity').value),unitE:$('costPrice').value,mode:$('costMode').value,currency:$('costCurrency').value,auto:$('costAuto').value==='auto'});};$('saveMaps').onclick=()=>call('mapCount',Number($('correctMaps').value));
$('reloadWindows').onclick=async()=>{const titles=await call('windows');if(!Array.isArray(titles))return;$('windowTitle').replaceChildren(...titles.map(t=>{const o=el('option',t);o.value=t;return o;}));$('windowTitle').value=state.settings.windowTitle;};$('saveSettings').onclick=()=>call('settings',{windowTitle:$('windowTitle').value});
$('saveManual').onclick=()=>call('manual',{...identity($('manualName').value),valueE:$('manualPrice').value});$('export').onclick=()=>call('export');$('restore').onclick=()=>{if(confirm('恢复后替换当前账本；恢复前会自动保存副本。继续？'))call('restore');};$('folder').onclick=()=>call('folder');
attachPicker($('costName'));attachPicker($('manualName'));
Workflow.init({action:call,tab:activeTab,flush:flushDraft});api.onUpdate(render);call('get').then(s=>{if(s){const o=el('option',s.settings.windowTitle);o.value=s.settings.windowTitle;$('windowTitle').append(o);loadPreset();}});setInterval(tick,1000);
