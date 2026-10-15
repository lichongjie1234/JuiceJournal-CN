'use strict';
const $ = id => document.getElementById(id);
const M = window.CNModel;
const storageKey = 'juicejournal-cn-v1';
let state;
try { state = JSON.parse(localStorage.getItem(storageKey)) || { league: '国服', books: {} }; } catch { state = { league: '国服', books: {} }; }
let image = null, points = [], selected = null, draft = null, scanning = false;
const canvas = $('canvas'), ctx = canvas.getContext('2d');
function book() { return state.books[state.league] ||= { templates: [], history: [], baseline: null, grid: null }; }
function save() { localStorage.setItem(storageKey, JSON.stringify(state)); }
function status(text) { $('status').textContent = text; }
function safe(fn) { return async (...args) => { try { await fn(...args); } catch(e) { status(e.message); } }; }
function invalidate() { draft = null; $('draft').replaceChildren(); }
function settingsChanged() { book().baseline = null; invalidate(); save(); render(); }
function render() {
  $('league').value = state.league;
  const b = book(), today = M.localDay();
  const records = b.history.filter(r => r.day === today);
  $('today').textContent = `${records.reduce((s,r) => s+r.net,0).toFixed(4)} D`;
  $('runs').textContent = `${records.length} 次`;
  $('baseInfo').textContent = b.baseline ? `基线：${new Date(b.baseline.at).toLocaleString()}；结算后自动以前一次终点作为新基线。` : '还没有基线';
  if (b.grid) {
    $('cols').value = b.grid.cols; $('rows').value = b.grid.rows;
    $('region').textContent = `区域 (${b.grid.x}, ${b.grid.y}) — (${b.grid.x+b.grid.w}, ${b.grid.y+b.grid.h})，${b.grid.cols} × ${b.grid.rows}`;
  } else $('region').textContent = '尚未选择区域';
  $('templates').replaceChildren();
  for (const t of b.templates) {
    const row = document.createElement('div'), img = document.createElement('img');
    img.src = t.icon; img.width = 36; img.height = 36;
    const label = document.createElement('span'); label.textContent = ` ${t.name} `;
    const price = document.createElement('input'); price.type = 'number'; price.min = 0; price.step = 'any'; price.value = t.price;
    price.onchange = safe(() => { const v = Number(price.value); if (price.value === '' || !Number.isFinite(v) || v < 0) throw new Error('单价必须为非负数'); t.price = v; save(); });
    const remove = document.createElement('button'); remove.textContent = '删除'; remove.onclick = () => { b.templates = b.templates.filter(x => x.id !== t.id); settingsChanged(); };
    row.append(img,label,price,document.createTextNode(' D/个'),remove); $('templates').append(row);
  }
  $('history').replaceChildren();
  const groups = {};
  for (const r of b.history) { (groups[r.day] ||= []).push(r); }
  for (const day of Object.keys(groups).sort().reverse()) {
    const details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = `${day} · ${groups[day].reduce((s,r)=>s+r.net,0).toFixed(4)} D · ${groups[day].length} 次结算`; details.append(summary);
    for (const r of groups[day]) {
      const p = document.createElement('p');
      p.textContent = `${new Date(r.at).toLocaleTimeString()}：净收益 ${r.net.toFixed(4)} D，仓库变化 ${r.change.toFixed(4)} D，额外投入 ${r.cost} D。${r.items.filter(i=>i.quantity).map(i=>`${i.name} ${i.quantity > 0 ? '+' : ''}${i.quantity} × ${i.price} D`).join('；')}`;
      details.append(p);
    }
    $('history').append(details);
  }
  draw();
}
function draw() {
  if (!image) return;
  ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0);
  const g = book().grid;
  if (g) { ctx.strokeStyle = '#00efbb'; ctx.lineWidth = 2; ctx.strokeRect(g.x,g.y,g.w,g.h); }
  for (const p of points) { ctx.fillStyle = '#ffbf00'; ctx.fillRect(p.x-5,p.y-5,10,10); }
  if (selected && g) { const r = cell(selected.col,selected.row); ctx.strokeStyle = '#ffbf00'; ctx.strokeRect(r.x,r.y,r.w,r.h); }
}
function cell(col,row) { const g=book().grid; return {x:g.x+col*g.w/g.cols,y:g.y+row*g.h/g.rows,w:g.w/g.cols,h:g.h/g.rows}; }
function crop(r, top = 0, height = 1, scale = 1) {
  const out=document.createElement('canvas'); out.width=Math.max(1,Math.round(r.w*scale)); out.height=Math.max(1,Math.round(r.h*height*scale));
  out.getContext('2d').drawImage(image,r.x,r.y+r.h*top,r.w,r.h*height,0,0,out.width,out.height); return out;
}
function sig(c) { return M.signature(c.getContext('2d').getImageData(0,0,c.width,c.height).data,c.width,c.height); }
async function loadImage(url) {
  const next = new Image(); await new Promise((resolve,reject)=>{next.onload=resolve;next.onerror=()=>reject(new Error('图片无法打开'));next.src=url;});
  if (next.width*next.height > 40000000) throw new Error('图片过大，请使用游戏截图');
  image=next; canvas.width=next.width; canvas.height=next.height; selected=null; invalidate();
  const g=book().grid;
  if (g && (g.imageWidth!==next.width || g.imageHeight!==next.height)) { book().grid=null; book().baseline=null; save(); status('图片分辨率变化，请重新选区域并建立基线'); }
  render();
}
canvas.onclick = safe(e => {
  if (!image || scanning) return;
  const bounds=canvas.getBoundingClientRect(), x=Math.max(0,Math.min(canvas.width,Math.round((e.clientX-bounds.left)*canvas.width/bounds.width))), y=Math.max(0,Math.min(canvas.height,Math.round((e.clientY-bounds.top)*canvas.height/bounds.height)));
  if (!book().grid) {
    points.push({x,y});
    if(points.length===2) {
      const [a,b]=points, cols=Number($('cols').value), rows=Number($('rows').value);
      if(b.x-a.x<cols*8 || b.y-a.y<rows*8) { points=[]; throw new Error('请先点击左上角，再点击右下角；确保范围足够大'); }
      book().grid={x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y,cols,rows,imageWidth:image.width,imageHeight:image.height}; points=[]; settingsChanged();
    }
  } else {
    const g=book().grid;
    if(x<g.x || y<g.y || x>=g.x+g.w || y>=g.y+g.h) return;
    selected={col:Math.floor((x-g.x)/g.w*g.cols),row:Math.floor((y-g.y)/g.h*g.rows)};
    $('selected').textContent=`第 ${selected.row+1} 行，第 ${selected.col+1} 列`;
  }
  draw();
});
$('image').onchange=safe(async e=>{ if(e.target.files[0]) { const url=URL.createObjectURL(e.target.files[0]); try{await loadImage(url);}finally{URL.revokeObjectURL(url);} } });
$('capture').onclick=safe(async()=>{if(!window.cnDesktop) throw new Error('浏览器模式请导入截图；截屏和数字 OCR 需要桌面版');await loadImage(await window.cnDesktop.capture());});
$('calibrate').onclick=()=>{book().grid=null;points=[];selected=null;settingsChanged();};
for (const id of ['cols','rows']) $(id).onchange=safe(()=>{const v=Number($(id).value);if(!Number.isInteger(v)||v<1||v>24)throw new Error('行列数应为 1～24');book().grid=null;points=[];settingsChanged();});
$('template').onclick=safe(()=>{
  if(!selected || !image || !book().grid) throw new Error('先在图中点击物品格');
  const name=$('name').value.trim(), price=Number($('price').value);
  if(!name || $('price').value==='' || !Number.isFinite(price)||price<0) throw new Error('请填写名称和国服单价');
  const c=crop(cell(selected.col,selected.row));
  if(book().templates.some(t=>t.name===name)) throw new Error('名称已存在，可直接修改现有模板单价');
  book().templates.push({id:crypto.randomUUID(),name,price,signature:sig(c),icon:c.toDataURL()}); settingsChanged();
});
function renderDraft() {
  $('draft').replaceChildren();
  for (const r of draft) {
    const tr=document.createElement('tr');
    const position=document.createElement('td');position.textContent=`${r.row+1}, ${r.col+1}`;
    const item=document.createElement('td'), select=document.createElement('select');
    const empty=document.createElement('option');empty.value='';empty.textContent='空格／不计入';select.append(empty);
    for(const t of book().templates){const op=document.createElement('option');op.value=t.id;op.textContent=t.name;select.append(op);}select.value=r.id||'';
    select.onchange=()=>{r.id=select.value;};item.append(select);
    const count=document.createElement('td'), input=document.createElement('input');input.type='number';input.min=0;input.step=1;input.placeholder='待核对';input.value=r.quantity??'';
    input.oninput=()=>{r.quantity=input.value===''?null:Number(input.value);}; count.append(input);
    const note=document.createElement('td'); note.textContent=r.note;tr.append(position,item,count,note);$('draft').append(tr);
  }
}
$('scan').onclick=safe(async()=>{
  if(!image || !book().grid || !book().templates.length) throw new Error('请先导入截图、选择网格并建立模板');
  if(scanning)return;scanning=true;
  const controls=[...document.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);
  controls.forEach(([el])=>{el.disabled=true;});
  try {
    draft=[];const images=[], refs=[],g=book().grid;
    for(let row=0;row<g.rows;row++)for(let col=0;col<g.cols;col++){
      const r=cell(col,row), c=crop(r), found=M.match(sig(c),book().templates);
      const entry={row,col,id:found?found.template.id:'',quantity:null,note:found?`图标差异 ${found.distance.toFixed(1)}；请核对数量`:'未知／空格，请检查是否有漏识别'};
      draft.push(entry);
      if(found){refs.push(entry);images.push(crop(r,0,.32,4).toDataURL());}
    }
    renderDraft();$('draft').querySelectorAll('input,select').forEach(el=>{el.disabled=true;});status(`匹配 ${refs.length} 格，正在识别堆叠数字……`);
    if(window.cnDesktop && refs.length){
      try{const result=await window.cnDesktop.digits(images);result.forEach((v,i)=>{refs[i].quantity=v.confidence>=60?v.quantity:null;refs[i].note=`数字 OCR ${Math.round(v.confidence)}%，请人工核对`;});}catch(e){status(`数字 OCR 未完成：${e.message}。可手动填写数量。`);}
    }
    renderDraft();status('草稿已生成。请逐格检查未知图标和数量，再保存基线或结算。');
  } finally {scanning=false;controls.forEach(([el,disabled])=>{el.disabled=disabled;});}
});
function verifiedRows(){
  if(!draft || scanning)throw new Error('请先扫描并核对当前截图');
  const rows=draft.filter(r=>r.id);
  if(!rows.length)throw new Error('至少选择一个已识别物品；数量为零可用于记录已用完的物品');
  M.quantities(rows);return rows.map(({id,quantity})=>({id,quantity}));
}
$('baseline').onclick=safe(()=>{const rows=verifiedRows();if(!confirm('已检查数量及漏识别的格子，并将当前数量保存为刷图前基线？'))return;book().baseline={rows,at:new Date().toISOString()};save();render();status('基线已保存，刷图后重新截图并扫描。');});
$('settle').onclick=safe(()=>{
  if(!book().baseline)throw new Error('请先保存刷图前基线');
  const rows=verifiedRows(), cost=Number($('cost').value);
  if($('cost').value==='')throw new Error('额外投入不可留空');
  const result=M.calculate(book().baseline.rows,rows,book().templates,cost);
  if(!confirm(`已核对所有格子？仓库变化 ${result.change.toFixed(4)} D，额外投入 ${cost} D，净收益 ${result.net.toFixed(4)} D。确认后保存本次记录。`))return;
  const at=new Date();book().history.push({...result,id:crypto.randomUUID(),day:M.localDay(at),at:at.toISOString(),startedAt:book().baseline.at});
  book().baseline={rows,at:at.toISOString()};invalidate();$('cost').value='0';save();render();status('已结算，终点已成为下一次基线。请使用新截图继续，避免重复记账。');
});
$('switch').onclick=safe(()=>{const name=$('league').value.trim();if(!name)throw new Error('请填写账本名称');state.league=name;image=null;canvas.width=0;points=[];selected=null;invalidate();save();render();});
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`国服刷图收益-${M.localDay()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('restore').onchange=safe(async e=>{
  const f=e.target.files[0];if(!f)return;if(f.size>20000000)throw new Error('备份过大');
  const candidate=JSON.parse(await f.text());
  if(!candidate || typeof candidate.league!=='string' || !candidate.books || Array.isArray(candidate.books))throw new Error('备份格式不正确');
  for(const b of Object.values(candidate.books)){
    if(!Array.isArray(b.templates)||!Array.isArray(b.history))throw new Error('备份格式不正确');
    for(const t of b.templates)if(typeof t.id!=='string'||typeof t.name!=='string'||!Number.isFinite(t.price)||t.price<0||!Array.isArray(t.signature)||t.signature.length!==432||t.signature.some(v=>!Number.isFinite(v))||typeof t.icon!=='string'||!t.icon.startsWith('data:image/png;base64,'))throw new Error('模板格式不正确');
    for(const r of b.history)if(!Number.isFinite(r.net)||!Number.isFinite(r.change)||!Number.isFinite(r.cost)||!Array.isArray(r.items)||typeof r.day!=='string')throw new Error('收益记录格式不正确');
    b.baseline=null;b.grid=null;
  }
  if(!confirm('恢复将覆盖当前账本。是否已导出当前备份并确认恢复？'))return;
  state=candidate;image=null;canvas.width=0;invalidate();save();render();status('备份已恢复。请重新选定网格并建立基线。');
});
render();
