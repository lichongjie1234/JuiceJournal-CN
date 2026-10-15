const {test}=require('node:test'),assert=require('node:assert/strict'),{filter}=require('../backpack/catalog-filter');
const items=[{id:'missing',name:'暗影',unitD:null},{id:'high',name:'点金石',unitD:2},{id:'low',name:'崇高石',unitD:.01},{id:'zero',name:'白色',unitD:0}];
test('D range filter includes boundaries and treats missing prices as zero',()=>{
 assert.deepEqual(filter(items,{maximum:0}).map(i=>i.id).sort(),['missing','zero']);assert.deepEqual(filter(items,{minimum:.01,maximum:2,sort:'price-desc'}).map(i=>i.id),['high','low']);assert.equal(items[0].unitD,null);
});
test('catalog sorts by D price or Chinese pinyin without changing original list',()=>{
 assert.deepEqual(filter(items,{sort:'name-asc'}).map(i=>i.id),['missing','zero','low','high']);assert.deepEqual(filter(items,{sort:'price-asc'}).map(i=>i.id),['missing','zero','low','high']);assert.equal(items[0].id,'missing');assert.equal(filter(items,{query:'点金'})[0].id,'high');
});
