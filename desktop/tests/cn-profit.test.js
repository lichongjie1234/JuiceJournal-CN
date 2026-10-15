const { test }=require('node:test');
const assert=require('node:assert/strict');
const M=require('../cn/model');
test('net value uses net quantity, CN prices and extra costs',()=>{
  const templates=[{id:'ex',name:'崇高石',price:.01},{id:'div',name:'神圣石',price:1}];
  const result=M.calculate([{id:'ex',quantity:100},{id:'div',quantity:2}],[{id:'ex',quantity:80},{id:'div',quantity:4}],templates,.3);
  assert.equal(result.change,1.8);assert.equal(result.net,1.5);
});
test('repeated snapshot produces no income; missing quantities rejected',()=>{
  const rows=[{id:'x',quantity:8}],templates=[{id:'x',price:1}];
  assert.equal(M.calculate(rows,rows,templates,0).net,0);
  assert.throws(()=>M.calculate(rows,[{id:'x',quantity:null}],templates,0));
  assert.throws(()=>M.calculate(rows,rows,[],0));
  assert.throws(()=>M.calculate(rows,rows,templates,-1));
});
test('icon matches reject unknown or ambiguous templates',()=>{
  assert.equal(M.match([0,0],[{id:'x',signature:[100,100]}]),null);
  assert.equal(M.match([0,0],[{id:'x',signature:[1,1]},{id:'y',signature:[2,2]}]),null);
  assert.equal(M.match([0,0],[{id:'x',signature:[0,0]},{id:'y',signature:[100,100]}]).template.id,'x');
});
test('same icons match despite changed stack digits',()=>{
  const a=new Uint8Array(40*40*4).fill(60),b=a.slice();b.fill(255,0,40*10*4);
  assert.deepEqual(M.signature(a,40,40),M.signature(b,40,40));
});
