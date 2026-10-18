(function(global){
 'use strict';
 const KEY='shitu.history.v1',LIMIT=100;
 function read(raw){try{const list=JSON.parse(raw||'[]');return Array.isArray(list)?list.filter(e=>e&&typeof e.source==='string'&&e.source.trim()&&e.source.length<=250&&typeof e.label==='string').slice(0,LIMIT):[];}catch{return [];}}
 function remember(list,source,label,now=Date.now(),context){
  const previous=list.find(e=>e.source===source&&e.label===label);
  return [{source,label,createdAt:previous?.createdAt||now,lastUsed:now,...(context||previous?.context?{context:structuredClone(context||previous.context)}:{})},...list.filter(e=>e!==previous)].slice(0,LIMIT);
 }
 function attach({root,storage,copy,confirm,getSource,getSnapshot,restoreSnapshot}){
  const doc=root.ownerDocument,make=(tag,cls,text)=>{const e=doc.createElement(tag);e.className=cls||'';if(text)e.textContent=text;return e;};
  let entries=read(storage.getItem(KEY));
  const workspace=root.querySelector('.workspace'),tabs=root.querySelector('.tabs'),results=root.querySelector('.results');
  const dock=make('div','quick-copy');dock.append(root.querySelector('.regex-box'),root.querySelector('.btn-row'),root.getElementById('save-status'));results.prepend(dock);
  const tab=make('button','history-tab','正则历史');tab.type='button';tab.id='regex-history-tab';tab.setAttribute('aria-pressed','false');tabs.append(tab);
  const panel=make('section','panel regex-history');panel.id='regex-history';panel.hidden=true;
  const heading=make('div','history-heading'),title=make('h2','','正则历史'),search=make('input');search.type='search';search.placeholder='搜索条件或正则';search.setAttribute('aria-label','搜索正则历史');heading.append(title,search);
  const note=make('p','history-note','复制成功后自动保存，重复复制合并为一条；最近使用的记录排在前面。'),list=make('div','history-list');panel.append(heading,note,list);workspace.after(panel);
  function save(){storage.setItem(KEY,JSON.stringify(entries));}
  let editorTab;
  function showHistory(show){workspace.hidden=show;panel.hidden=!show;tab.setAttribute('aria-pressed',String(show));if(show){editorTab=root.querySelector('[data-tab][aria-pressed="true"]')||editorTab;root.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed','false'));render();}else if(!root.querySelector('[data-tab][aria-pressed="true"]'))editorTab?.setAttribute('aria-pressed','true');}
  tab.onclick=()=>showHistory(true);
  root.addEventListener('click',e=>{if(e.target.closest('[data-tab]'))showHistory(false);});
  root.getElementById('language').addEventListener('change',()=>{if(!panel.hidden)showHistory(true);});
  async function copyEntry(source,label,context){try{await copy(source);entries=remember(entries,source,label,Date.now(),context);save();render();root.getElementById('save-status').textContent='✓ 已复制，已保存到正则历史';return true;}catch(e){root.getElementById('save-status').textContent='复制失败：'+e.message;note.textContent='复制失败：'+e.message;return false;}}
  root.getElementById('copy').onclick=()=>{const source=getSource();if(!source)return;const label=root.querySelector('[data-tab][aria-pressed="true"]')?.textContent||'正则';const conditions=[...root.querySelectorAll('#summary .condition')].map(e=>{const clone=e.cloneNode(true);clone.querySelectorAll('button').forEach(b=>b.remove());return clone.textContent.trim();});return copyEntry(source,label,{snapshot:getSnapshot(),conditions});};
  function render(){
   tab.textContent=`正则历史${entries.length?' · '+entries.length:''}`;list.replaceChildren();
   const query=search.value.trim().toLocaleLowerCase(),filtered=entries.filter(e=>(e.label+' '+e.source+' '+(e.context?.conditions||[]).join(' ')).toLocaleLowerCase().includes(query));
   if(!filtered.length){list.append(make('p','history-empty',entries.length?'没有匹配的历史记录':'还没有历史记录，生成正则后点击“复制正则”即可保存。'));return;}
   for(const entry of filtered){
    const row=make('article','history-entry'),meta=make('div','history-meta'),label=make('span','history-label',entry.label),time=make('time','',new Date(entry.lastUsed||entry.createdAt).toLocaleString('zh-CN',{hour12:false}));meta.append(label,time);
    const source=make('pre','history-source',entry.source),actions=make('div','history-actions'),button=make('button','history-copy','复制正则'),remove=make('button','history-delete','删除');button.type=remove.type='button';button.onclick=async()=>{if(await copyEntry(entry.source,entry.label,entry.context)){note.textContent='✓ 已复制到剪贴板';}};
    remove.onclick=async()=>{if(!await confirm('删除这条正则历史？已保存的命名方案不会受影响。'))return;entries=entries.filter(e=>e!==entry);save();render();};actions.append(button);
    const conditions=make('div','history-conditions');
    if(entry.context?.snapshot){const details=make('details'),summary=make('summary','','查看已选条件');details.append(summary);for(const text of entry.context.conditions||[])details.append(make('p','',text));if(!entry.context.conditions?.length)details.append(make('p','','条件已保存，可点击“恢复条件”查看。'));conditions.append(details);const restore=make('button','history-restore','恢复条件');restore.onclick=()=>{showHistory(false);restoreSnapshot(structuredClone(entry.context.snapshot));root.getElementById('save-status').textContent='✓ 已恢复这条历史的筛选条件';};actions.append(restore);}else conditions.textContent='旧记录未保存筛选条件';
    actions.append(remove);row.append(meta,source,conditions,actions);list.append(row);
   }
  }
  search.oninput=render;render();
 }
 const api={read,remember,attach};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.RegexHistory=api;
})(globalThis);
