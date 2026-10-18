const {test}=require('node:test'),assert=require('node:assert/strict');
const Picker=require('../backpack/item-picker'),Rules=require('../backpack/recognition-rules');
test('item picker searches repeatedly, normalizes full-width text and preserves input catalog',()=>{
 const items=[{id:'a',name:'神圣石',english:'Divine Orb'},{id:'b',name:'机遇预兆',english:'Omen of Chance'},{id:'c',name:'混沌稀有预兆',english:'Omen on Chaos Rarity'}];
 assert.equal(Picker.search(items,'神圣')[0].id,'a');assert.equal(Picker.search(items,'机 遇')[0].id,'b');assert.equal(Picker.search(items,'混沌稀有')[0].id,'c');assert.equal(Picker.search(items,'ＤＩＶＩＮＥ')[0].id,'a');assert.equal(items.length,3);
});
const sig=(v=60)=>Array(1200).fill(v),badge=v=>Array(192).fill(v);
test('exclusions survive quantity and position changes, with grade guard for non-tablets',()=>{
 const cell={id:'map15',name:'引路石',grade:'XV',kind:'map',quantity:1,confirmed:true,excluded:true,identitySignature:sig(),badgeSignature:badge(20)};
 const rule=Rules.ruleFor(cell),next={identitySignature:sig(61),badgeSignature:badge(20),quantity:99,index:40};
 Rules.applyRule(next,Rules.matching(next,[rule]));assert.equal(next.excluded,true);assert.equal(next.confirmed,true);
 assert.equal(Rules.matching({identitySignature:sig(61),badgeSignature:badge(80)},[rule]),null);
});
test('learned identity never copies a previous material stack count',()=>{
 const cell={id:'div',name:'神圣石',kind:'material',quantity:3,confirmed:true,identitySignature:sig(),badgeSignature:badge(20),topMark:{arabic:3}};
 const rule=Rules.ruleFor(cell),next={topMark:{arabic:7}};Rules.applyRule(next,rule);assert.equal(next.quantity,7);assert.equal(next.confirmed,true);
 const unknown={topMark:{arabic:null}};Rules.applyRule(unknown,rule);assert.equal(unknown.quantity,null);assert.equal(unknown.confirmed,false);
});
test('tablet rule separates one tablet from remaining uses and does not require repeated confirmation',()=>{
 const cell={id:'tablet',name:'石板',kind:'tablet',quantity:1,remainingUses:9,confirmed:true,identitySignature:sig(),badgeSignature:badge(20),bottomMark:{arabic:9}};
 const rule=Rules.ruleFor(cell),next={identitySignature:sig(),badgeSignature:badge(150),bottomMark:{arabic:8}};
 Rules.applyRule(next,Rules.matching(next,[rule]));assert.equal(next.quantity,1);assert.equal(next.remainingUses,8);assert.equal(next.confirmed,true);
});
test('ambiguous learned icons remain pending',()=>{
 const a={id:'a',signature:sig(),badge:badge(20)},b={id:'b',signature:sig(61),badge:badge(20)};
 assert.equal(Rules.matching({identitySignature:sig(),badgeSignature:badge(20)},[a,b]),null);
});

test('cost picker prioritizes currency among equally relevant results without hiding exact matches',()=>{const items=[{id:'slab',name:'甲石板'},{id:'currency',name:'乙通货',category:'通货仓库'},{id:'div',name:'神圣石',english:'Divine Orb'}];assert(Picker.currency(Picker.search(items,'',12,true)[0]));assert.equal(Picker.search(items,'',12,true).at(-1).id,'slab');assert.equal(Picker.search(items,'甲',12,true)[0].id,'slab');assert.equal(Picker.search(items,'神圣',12,true)[0].id,'div');});
