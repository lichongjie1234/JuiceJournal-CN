const {test}=require('node:test'),assert=require('node:assert/strict'),H=require('../backpack/regex-history');
test('regex history restores valid records and rejects broken or oversized entries',()=>{
 assert.deepEqual(H.read('{broken'),[]);assert.deepEqual(H.read('{}'),[]);
 const good={source:'"生命"',label:'引路石',createdAt:1,lastUsed:2};
 assert.deepEqual(H.read(JSON.stringify([null,{},good,{source:'x'.repeat(251),label:'石板'}])),[good]);
});
test('copy history merges repeated context, keeps original creation time, and moves to front',()=>{
 let list=H.remember([],'"生命"','引路石',1);list=H.remember(list,'"抗性"','装备',2);list=H.remember(list,'"生命"','引路石',3);
 assert.equal(list.length,2);assert.equal(list[0].createdAt,1);assert.equal(list[0].lastUsed,3);
 assert.deepEqual(H.read(JSON.stringify(list)),list);
 list=H.remember(list,'"生命"','石板',4);assert.equal(list.length,3);
 for(let i=0;i<150;i++)list=H.remember(list,'r'+i,'引路石',i+5);
 assert.equal(list.length,100);assert.equal(list[0].source,'r149');
});

test('history preserves independent condition snapshots when copied again or reloaded',()=>{
 const context={snapshot:{version:1,tab:'waystone',waystone:{values:{quantity:'80'},selected:{example:{mode:'exclude'}}}},conditions:['物品数量 ≥ 80','排除示例']};
 let list=H.remember([],'r','引路石',1,context);context.snapshot.waystone.values.quantity='999';assert.equal(list[0].context.snapshot.waystone.values.quantity,'80');
 list=H.remember(list,'r','引路石',2);assert.equal(list[0].context.snapshot.waystone.values.quantity,'80');assert.deepEqual(H.read(JSON.stringify(list))[0].context,list[0].context);
});
