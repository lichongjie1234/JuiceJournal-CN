(function(){
 'use strict';
 const $=id=>document.getElementById(id),make=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 let state,action,tab,flush,selection=null,savedKey='',dirty=false,catalogKey='',decisionHash='',editorId='',filtered=[];
 const selectedKey=s=>JSON.stringify(s.trackedIds),formatD=v=>v==null?'待补价':Number(v).toLocaleString('zh-CN',{maximumSignificantDigits:5})+' D';
 function feedback(text,error=false){$('message').textContent=text;let box=$('actionFeedback');if(!box){box=make('div');box.id='actionFeedback';box.setAttribute('role','status');document.body.append(box);}box.textContent=text;box.classList.toggle('error',error);box.hidden=false;clearTimeout(box._timer);box._timer=setTimeout(()=>box.hidden=true,8000);}
 function lists(){
  if(!state)return;const value=id=>$(id).value===''?null:Number($(id).value),items=CatalogFilter.filter(state.catalog,{query:$('trackingSearch').value,minimum:value('priceMinimum'),maximum:value('priceMaximum'),sort:$('trackingSort').value});
  filtered=items;$('addFiltered').textContent=`全部加入 → ${items.filter(i=>!selection.has(i.id)).length}`;$('addFiltered').disabled=items.every(i=>selection.has(i.id));
  for(const [button,min,max]of [['allFilterToggle','priceMinimum','priceMaximum'],['trackedFilterToggle','trackedMinimum','trackedMaximum']]){const count=Number($(min).value!=='')+Number($(max).value!=='');$(button).textContent='D价筛选'+(count?' · '+count:'');$(button).classList.toggle('filter-active',count>0);}
  for(const id of ['allItems','trackedItems'])$(id).replaceChildren();
  const chosen=CatalogFilter.filter(state.catalog.filter(i=>selection.has(i.id)),{query:$('trackedSearch').value,minimum:value('trackedMinimum'),maximum:value('trackedMaximum'),sort:$('trackedSort').value});
  for(const [target,entries,included]of [['allItems',items,false],['trackedItems',chosen,true]])for(const item of entries){
   const addRow=(target,included)=>{const row=make('div');row.className='tracking-item';row.draggable=true;row.dataset.itemId=item.id;
    row.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',item.id));
    const name=make('span',item.name),price=make('small',item.unitD==null?'0 D（待补价）':formatD(item.unitD)),button=make('button',included?'← 移出':'加入 →');name.append(price);button.disabled=!included&&selection.has(item.id);button.onclick=()=>move(item.id,!included);row.append(name,button);$(target).append(row);};
   addRow(target,included);
  }
  $('allItemCount').textContent=items.length+' / '+state.catalog.length+' 种';$('trackedCount').textContent=chosen.length+' / '+selection.size+' 种';
  $('trackingStatus').textContent=dirty?'有未保存修改':state.trackedIds==null?'保存后启用自选清单':'已保存';
 }
 function move(id,add){if(!state.catalog.some(i=>i.id===id))return;if(!add){if(selection.has(id))confirmDelete(null,null,id);return;}selection.add(id);dirty=true;lists();}
 function decision(){let panel=$('scanDecision');if(!panel){panel=make('div');panel.id='scanDecision';panel.className='scan-decision';panel.append(make('h3','本次背包如何入账？'),make('p','对比上次：只统计增减。新背包基线：本次不计收益，适用于存仓或整理后。空基线：把这次扫描的统计物品全部算作产出。'));
   for(const [mode,label]of [['compare','对比上次背包'],['baseline','新背包／只存基线'],['empty','空基线／全部计入产出']]){const b=make('button',label);b.dataset.saveMode=mode;b.onclick=async()=>{await flush?.();const result=await action('scanDecision',mode);if(result&&!state.draft){feedback(result.message);tab('overview');}};panel.append(b);}$('reviewRows').before(panel);}
  panel.hidden=!state.draft?.needsDecreaseDecision;let info=$('scanDecisionInfo');if(!info){info=make('p');info.id='scanDecisionInfo';panel.append(info);}if(state.draft){const cells=state.draft.cells;info.textContent=`本次 ${cells.length} 格：纳入统计 ${cells.filter(c=>!c.excluded&&!c.notTracked).length} 格，未纳入清单 ${cells.filter(c=>c.notTracked).length} 格，未识别 ${cells.filter(c=>!c.excluded&&!c.id).length} 格。${state.draft.decreased?'检测到物品减少；刚存仓时请选择新基线。':''}`;}
  if(!panel.hidden&&decisionHash!==state.draft.imageHash){decisionHash=state.draft.imageHash;tab('review');}
 }
 async function editLatest(){if(state.draft){if(state.draft.needsDecreaseDecision||state.draft.cells.some(c=>!c.confirmed)){feedback('当前有扫描草稿，请先保存或放弃，再编辑已入账数量。',true);tab('review');return;}await flush?.();if(state.draft){const result=await action('commit',state.draft.cells);if(!result)return;}}const record=state.current?.records.at(-1);if(!record){feedback('还没有库存变化记录；起始背包仅作为比较基线。',true);return;}editorId=record.id;const parent=$('latestEditor');parent.replaceChildren();parent.hidden=false;
  parent.append(make('p','只修改本次数量变化（可填负数）；物品、原单价不可修改，合计自动计算。'));
  const table=make('table'),head=make('tr');['物品','数量变化','原单价','合计'].forEach(t=>head.append(make('th',t)));table.append(head);const changes=[];
  for(const item of record.items){const row=make('tr'),name=state.catalog.find(i=>i.id===item.id)?.name||item.id.replace(/^custom:/,''),input=make('input');input.type='number';input.step='1';input.value=item.quantity;input.dataset.quantityId=item.id;
   const count=make('td'),unit=make('td'),total=make('td'),change={id:item.id,quantity:item.quantity};changes.push(change);count.append(input);
   const value=v=>formatD(v==null||!record.prices.rateE?null:v/record.prices.rateE);
   unit.textContent=value(item.unitE);total.textContent=value(item.valueE);input.oninput=()=>{change.quantity=input.value===''?null:Number(input.value);total.textContent=Number.isSafeInteger(change.quantity)?value(change.quantity===0?0:item.unitE==null?null:item.unitE*change.quantity):'请输入整数';};row.append(make('td',name),count,unit,total);table.append(row);
  }
  parent.append(table);const save=make('button','保存数量修改'),cancel=make('button','取消');save.onclick=async()=>{if(state.current?.records.at(-1)?.id!==editorId){parent.replaceChildren(make('p','记录已变化，请重新打开编辑。'));return;}if(changes.some(c=>!Number.isSafeInteger(c.quantity))){$('message').textContent='数量必须为整数。';return;}const result=await action('editLatest',changes);if(result){parent.hidden=true;editorId='';}};cancel.onclick=()=>{parent.hidden=true;editorId='';};parent.append(save,cancel);
  feedback('已打开数量编辑，修改后点击“保存数量修改”。');parent.scrollIntoView({block:'center',behavior:'smooth'});parent.querySelector('input')?.focus({preventScroll:true});
 }
 function confirmDelete(session,record,removeItem=null){let box=$('deleteRecordConfirm');if(!box){box=make('div');box.id='deleteRecordConfirm';box.className='delete-confirm-overlay';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');const panel=make('div');panel.className='panel';const text=make('p');text.id='deleteRecordDescription';const yes=make('button','确认删除'),no=make('button','取消');yes.id='confirmDeleteRecord';no.id='cancelDeleteRecord';no.onclick=()=>{box.hidden=true;};box.addEventListener('keydown',e=>{if(e.key==='Escape'){box.hidden=true;e.stopPropagation();}});box.addEventListener('click',e=>{if(e.target===box)box.hidden=true;});panel.append(make('h2'),text,yes,no);box.append(panel);document.body.append(box);}
  const title=removeItem?'移出统计清单？':'删除这次库存变化？';box.querySelector('h2').textContent=title;box.setAttribute('aria-label',title);
  $('deleteRecordDescription').textContent=removeItem?`将“${state.catalog.find(i=>i.id===removeItem)?.name}”从右侧移出。保存统计清单后生效，历史收益保留。`:`将删除 ${new Date(record.at||Date.now()).toLocaleString('zh-CN',{hour12:false})} 的库存变化，并重新计算收益。当前背包基线保留，其他记录不变。`;
  const yes=$('confirmDeleteRecord');yes.textContent=removeItem?'确认移出':'确认删除';yes.disabled=false;yes.onclick=async()=>{yes.disabled=true;try{if(removeItem){selection.delete(removeItem);dirty=true;lists();box.hidden=true;return;}const result=await action('deleteRecord',{sessionId:session.id,recordId:record.id});if(result)box.hidden=true;}finally{yes.disabled=false;}};box.hidden=false;$('cancelDeleteRecord').focus({preventScroll:true});
 }
 function deleteButton(session,record){const b=make('button','×');b.className='delete-record';b.title='删除这次库存变化（需确认）';b.setAttribute('aria-label','删除这次库存变化');b.onclick=e=>{e.preventDefault();e.stopPropagation();confirmDelete(session,record);};return b;}
 function beginEnd(){if(!state.current){feedback('当前没有进行中的一轮；扫描背包后自动开始。',true);return;}let box=$('endConfirm');if(!box){box=make('div');box.id='endConfirm';box.className='scan-decision';box.append(make('p','结束后停止本轮计时，并保存到历史记录。下次扫描将开启新一轮。'));const yes=make('button','确认结束并归档'),no=make('button','继续本轮');yes.id='confirmEnd';no.id='cancelEnd';yes.onclick=async()=>{yes.disabled=true;try{await flush?.();const next=await action('end');if(next){box.hidden=true;tab('history');}else if(state.draft)tab('review');}finally{yes.disabled=false;}};no.onclick=()=>box.hidden=true;box.append(yes,no);$('end').closest('.panel').after(box);}box.hidden=false;feedback('请确认是否结束本轮；也可选择“继续本轮”。');box.scrollIntoView({block:'center',behavior:'smooth'});}
 function init(options){action=options.action;tab=options.tab;flush=options.flush;$('trackingSearch').oninput=lists;for(const id of ['priceMinimum','priceMaximum'])$(id).oninput=lists;$('trackingSort').onchange=lists;$('resetPriceFilter').onclick=()=>{$('trackingSearch').value='';$('priceMinimum').value='';$('priceMaximum').value='';$('trackingSort').value='name-asc';lists();};$('saveTracked').onclick=async()=>{const result=await action('tracked',[...selection]);if(result){dirty=false;savedKey=selectedKey(result);lists();}};
  for(const [id,add]of [['trackedItems',true],['allItems',false]]){const n=$(id);n.ondragover=e=>{e.preventDefault();n.classList.add('drag-over');};n.ondragleave=()=>n.classList.remove('drag-over');n.ondrop=e=>{e.preventDefault();n.classList.remove('drag-over');move(e.dataTransfer.getData('text/plain'),add);};}
  $('editLatest').onclick=editLatest;
  for(const [button,panel]of [['allFilterToggle','leftRangePanel'],['trackedFilterToggle','rightRangePanel']])$(button).onclick=()=>{const open=$(panel).hidden;for(const [b,p]of [['allFilterToggle','leftRangePanel'],['trackedFilterToggle','rightRangePanel']]){$(p).hidden=true;$(b).setAttribute('aria-expanded','false');}$(panel).hidden=!open;$(button).setAttribute('aria-expanded',String(open));};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.range-anchor'))for(const [b,p]of [['allFilterToggle','leftRangePanel'],['trackedFilterToggle','rightRangePanel']]){$(p).hidden=true;$(b).setAttribute('aria-expanded','false');}});
  for(const id of ['trackedSearch','trackedMinimum','trackedMaximum'])$(id).oninput=lists;$('trackedSort').onchange=lists;$('resetTrackedFilter').onclick=()=>{$('trackedSearch').value='';$('trackedMinimum').value='';$('trackedMaximum').value='';$('trackedSort').value='name-asc';lists();};
  $('addFiltered').onclick=()=>{let added=0;for(const i of filtered)if(!selection.has(i.id)){selection.add(i.id);added++;}if(added)dirty=true;lists();feedback(`已将筛选结果中的 ${added} 种物品加入右侧；点击“保存清单”后生效。`);};
  $('deleteLatest').onclick=()=>{const r=state.current?.records.at(-1);if(!r){feedback('没有可删除的库存变化。',true);return;}deleteButton(state.current,r).click();};$('end').onclick=beginEnd;
  $('clearRecords').onclick=()=>{const scope=$('clearScope');$('clearConfirm').dataset.scope=scope.value;$('clearDescription').textContent='将清除“'+scope.selectedOptions[0].textContent+'”。清除前自动备份；物品清单、识别记忆和配置保留。';$('clearConfirm').hidden=false;};
  $('cancelClear').onclick=()=>$('clearConfirm').hidden=true;$('confirmClear').onclick=async()=>{const result=await action('clearRecords',$('clearConfirm').dataset.scope);if(result)$('clearConfirm').hidden=true;};
 }
 function render(s){state=s;const key=selectedKey(s),prices=JSON.stringify([s.prices.snapshot?.fetchedAt,s.prices.rateE,s.catalog.map(i=>[i.id,i.name,i.unitD])]);if(selection==null||(!dirty&&key!==savedKey)){selection=new Set(s.trackedIds??Object.keys(s.current?.baseline.quantities||{}));savedKey=key;catalogKey='';}if(catalogKey!==prices||key!==savedKey){catalogKey=prices;lists();}
  $('saveTracked').disabled=s.busy||Boolean(s.draft);$('editLatest').disabled=s.busy;$('deleteLatest').disabled=s.busy;$('clearRecords').disabled=s.busy||Boolean(s.draft);decision();
  if(editorId&&editorId!==s.current?.records.at(-1)?.id){$('latestEditor').hidden=true;editorId='';}
 }
 window.Workflow={init,render,feedback,deleteButton};
})();
