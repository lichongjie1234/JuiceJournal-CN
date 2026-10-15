(function(root){
 const price=i=>Number.isFinite(i.unitD)&&i.unitD>0?i.unitD:0;
 function filter(items,{query='',minimum=null,maximum=null,sort='name-asc'}={}){const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s/g,'');const q=norm(query),collator=new Intl.Collator('zh-CN-u-co-pinyin',{numeric:true,sensitivity:'base'});
  return items.filter(i=>(!q||norm(i.name+' '+i.english).includes(q))&&(minimum==null||price(i)>=minimum)&&(maximum==null||price(i)<=maximum)).sort((a,b)=>{const name=collator.compare(a.name,b.name);return sort==='price-desc'?price(b)-price(a)||name:sort==='price-asc'?price(a)-price(b)||name:sort==='name-desc'?-name:name;});
 }
 const api={filter,price};if(typeof module!=='undefined')module.exports=api;else root.CatalogFilter=api;
})(typeof window==='undefined'?globalThis:window);
