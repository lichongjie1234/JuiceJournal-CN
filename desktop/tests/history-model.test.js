const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../backpack/history-model');
const at=Date.parse('2026-10-16T00:00:00+08:00');
const fixture=()=>[{id:'a',startedAt:at-1000,endedAt:at+10000,season:'S1',records:[{id:'r',at,prices:{rateE:100},before:{quantities:{orb:1}},after:{quantities:{orb:4},rows:[{id:'orb',name:'历史名称'}]},items:[{id:'orb',quantity:3,unitE:100,valueE:300},{id:'missing',quantity:2,unitE:null,valueE:null}]}],incomes:[{id:'i',at:at+1,name:'交易收入',quantity:1,unitD:2,valueD:2}],costs:[{id:'c',at:at+2,name:'石板',quantity:1,unitE:100,chargedE:100,rateE:100,mode:'extra'},{id:'m',at:at+3,name:'材料',quantity:1,chargedE:0,mode:'inventory'}]}];
test('history uses frozen prices and historical names, keeps missing prices and avoids charging inventory memo twice',()=>{
 const rows=M.flatten(fixture(),[{id:'orb',name:'新名称',unitD:999}]);assert.equal(rows.length,5);assert.equal(rows[0].name,'历史名称');assert.equal(rows[0].valueD,3);assert.equal(rows[0].before,1);assert.equal(rows[1].valueD,null);
 const a=M.summarize(rows);assert.equal(a.income,5);assert.equal(a.cost,1);assert.equal(a.knownNet,4);assert.equal(a.net,null);assert.equal(a.unknown,1);assert.equal(rows.at(-1).valueD,0);
});
test('history combines China dates, item/type/status/session/season/direction and signed amount filters',()=>{
 const rows=M.flatten(fixture());assert.equal(M.day(at-1),'2026-10-15');assert.equal(M.query(rows,{start:'2026-10-16',end:'2026-10-16'}).length,5);
 assert.equal(M.query(rows,{start:'2026-10-17'}).length,0);assert.equal(M.query(rows,{search:'历史',type:'inventory',status:'ended',sessionId:'a',season:'S1',direction:'positive',minimum:3,maximum:3}).length,1);
 assert.equal(M.query(rows,{direction:'unknown'}).length,1);assert.equal(M.query(rows,{maximum:0}).length,2);assert.equal(M.query(rows,{sort:'value-desc'}).at(-1).valueD,null);
});
test('grouped statistics use exactly the filtered transactions, including manual income and costs',()=>{
 const rows=M.flatten(fixture()),known=M.query(rows,{direction:'positive'}),groups=M.group(known,'day');assert.equal(groups.length,1);assert.equal(groups[0].net,5);assert.equal(groups[0].count,2);
 const item=M.group(rows,'item').find(g=>g.id==='orb');assert.equal(item.quantity,3);assert.equal(item.net,3);assert.equal(M.group(rows,'session')[0].unknown,1);
});
test('CSV preserves quotes and newlines and neutralizes spreadsheet formulas in names',()=>{
 const csv=M.csv([['名称','数量'],['=1+1',-2],['a"b\nc',3]]);assert.ok(csv.includes("\"'=1+1\""));assert.ok(csv.includes('"a""b\nc"'));assert.ok(csv.includes('"-2"'));
});
