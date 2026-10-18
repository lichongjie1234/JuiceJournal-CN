const {test}=require('node:test'),assert=require('node:assert/strict'),W=require('../backpack/window-mode');
const displays=[{workArea:{x:-1920,y:0,width:1920,height:1040}},{workArea:{x:0,y:0,width:2560,height:1400}}];
test('small and full bounds stay reachable across disconnected and negative-coordinate displays',()=>{
 const mini=W.bounds({x:-1800,y:80,width:360,height:360},true,displays,displays[1]);assert.equal(mini.x,-1800);assert.equal(mini.width,360);
 const lost=W.bounds({x:8000,y:0,width:360,height:360},true,displays,displays[0]);assert.equal(lost.x,-1890);
 const edge=W.bounds({x:2500,y:1390,width:360,height:360},true,displays,displays[1]);assert.equal(edge.x,2200);assert.equal(edge.y,1040);
 assert.equal(W.bounds({x:0,y:0,width:10,height:10},false,displays,displays[1]).width,780);
});
test('opacity stays visible and rejects invalid inputs',()=>{assert.equal(W.opacity(.1),.4);assert.equal(W.opacity(2),1);assert.equal(W.opacity(.75),.75);for(const x of [NaN,Infinity,'0.5',null])assert.throws(()=>W.opacity(x));});
test('mode switching preserves independent sizes, opacity, pin and ledger',()=>{
 let b={x:100,y:90,width:1100,height:800},o=1,p=false,min;const win={getBounds:()=>({...b}),isMaximized:()=>false,setMinimumSize:(...v)=>min=v,setBounds:v=>b=v,setOpacity:v=>o=v,setAlwaysOnTop:v=>p=v};
 const settings={pin:false,miniPin:true,miniOpacity:.65},ledger={records:[1]};W.apply(win,settings,true,displays,displays[1]);assert.equal(b.width,340);assert.equal(o,.65);assert.equal(p,true);assert.deepEqual(min,[280,210]);b.x=300;
 W.apply(win,settings,false,displays,displays[1]);assert.equal(b.width,1100);assert.equal(o,1);assert.equal(p,false);W.apply(win,settings,true,displays,displays[1]);assert.equal(b.x,300);assert.deepEqual(ledger,{records:[1]});
});

test('disconnected display keeps saved size while recovering position',()=>{const actual=W.bounds({x:9000,y:9000,width:422,height:225},true,displays,displays[0]);assert.equal(actual.width,422);assert.equal(actual.height,225);assert.equal(actual.x,-1890);});
test('window crossing display edges uses largest visible area rather than its top-left corner',()=>{const actual=W.bounds({x:-7,y:100,width:422,height:230},true,displays,displays[1]);assert.equal(actual.x,0);assert.equal(actual.width,422);});
