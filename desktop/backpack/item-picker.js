(function(root){
 'use strict';
 const pickers=new Set();let installed=false;
 function install(){if(installed)return;installed=true;
  const closeAll=()=>pickers.forEach(p=>p.close());
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll();},true);
  document.addEventListener('pointerdown',e=>pickers.forEach(p=>{if(!p.input.contains(e.target)&&!p.box.contains(e.target))p.close();}),true);
  window.addEventListener('blur',closeAll);window.addEventListener('resize',closeAll);document.addEventListener('visibilitychange',closeAll);
  document.addEventListener('scroll',e=>pickers.forEach(p=>{if(!p.box.contains(e.target))p.close();}),true);
  new MutationObserver(()=>{for(const p of pickers)if(!p.input.isConnected){pickers.delete(p);p.box.remove();}}).observe(document.body,{childList:true,subtree:true});
 }
 const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 function search(items,query,limit=12){const q=normalize(query);return items.map(item=>{const name=normalize(item.name),english=normalize(item.english),id=normalize(item.id);let score=!q?0:name===q?100:name.startsWith(q)?80:name.includes(q)?60:english.includes(q)?40:id.includes(q)?20:-1;return {item,score};}).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||a.item.name.localeCompare(b.item.name,'zh-CN')).slice(0,limit).map(x=>x.item);}
 function attach(input,getItems,onSelect){
  install();
  if(input._itemPicker)return input._itemPicker;
  input.removeAttribute('list');input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
  const box=document.createElement('div');box.className='item-picker';box.id='picker-'+Math.random().toString(36).slice(2);box.setAttribute('role','listbox');box.hidden=true;document.body.append(box);input.setAttribute('aria-controls',box.id);
  let options=[],active=-1;
  function close(){if(box.hidden)return;box.hidden=true;box.replaceChildren();active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function choose(index){const item=options[index];if(!item)return;input.value=item.name;input.dispatchEvent(new Event('input',{bubbles:true}));onSelect?.(item);input.focus({preventScroll:true});close();}
  function highlight(){[...box.children].forEach((node,i)=>{node.classList.toggle('active',i===active);node.setAttribute('aria-selected',String(i===active));});if(active>=0){input.setAttribute('aria-activedescendant',box.id+'-'+active);const n=box.children[active];if(n.offsetTop<box.scrollTop)box.scrollTop=n.offsetTop;else if(n.offsetTop+n.offsetHeight>box.scrollTop+box.clientHeight)box.scrollTop=n.offsetTop+n.offsetHeight-box.clientHeight;}}
  function open(){if(!input.isConnected)return;for(const p of pickers)if(p.input!==input)p.close();options=search(getItems(),input.value);box.replaceChildren();active=-1;if(!options.length){close();return;}
   options.forEach((item,i)=>{const option=document.createElement('div');option.className='picker-option';option.id=box.id+'-'+i;option.setAttribute('role','option');option.textContent=item.name;option.addEventListener('pointerdown',event=>{event.preventDefault();choose(i);});box.append(option);});
   const rect=input.getBoundingClientRect();box.style.left=rect.left+'px';box.style.width=Math.max(220,rect.width)+'px';box.style.maxHeight=Math.max(90,Math.min(260,window.innerHeight-rect.bottom-12))+'px';box.style.top=(rect.bottom+4)+'px';box.hidden=false;input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('input',open);input.addEventListener('focus',open);input.addEventListener('blur',close);
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){close();event.stopPropagation();event.preventDefault();return;}if(event.key==='Tab'){close();return;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){if(box.hidden)open();if(!options.length)return;event.preventDefault();active=active<0?(event.key==='ArrowDown'?0:options.length-1):(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;highlight();}else if(event.key==='Enter'&&!box.hidden&&active>=0){event.preventDefault();choose(active);}});
  pickers.add({input,box,close});
  return input._itemPicker={close,open};
 }
 const api={normalize,search,attach};if(typeof module!=='undefined')module.exports=api;else root.ItemPicker=api;
})(typeof window!=='undefined'?window:globalThis);
