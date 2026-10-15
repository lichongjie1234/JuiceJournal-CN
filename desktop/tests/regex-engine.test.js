const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../backpack/regex-engine');
test('integrated regex engine preserves exact inclusive numeric ranges',()=>{for(const [lo,hi]of [[0,9],[10,25],[99,101],[150,299],[0,999]]){const regex=new RegExp('^(?:'+R.numberInRange(lo,hi)+')$');for(let value=0;value<=999;value++)assert.equal(regex.test(String(value)),value>=lo&&value<=hi,`${lo}-${hi}: ${value}`);}});
test('PoE2 output preserves include/exclude and rejects overflow and impossible minimum counts',()=>{
 const result=R.buildRegex({includes:['点燃','抗性'],excludes:['反射'],match:'all',dialect:'poe2',maxLength:250});assert.equal(result.ok,true);assert.match(result.source,/"!反射"/);assert.ok(!result.source.includes('(?='));
 assert.equal(R.buildRegex({includes:['a'.repeat(251)],excludes:[],match:'all',dialect:'poe2',maxLength:250}).ok,false);
 assert.equal(R.buildRegex({includes:['生命'],excludes:[],match:'atleast2',dialect:'poe2',maxLength:250}).ok,false);
});
