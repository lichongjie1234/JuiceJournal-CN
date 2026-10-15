const {test}=require('node:test');
const assert=require('node:assert/strict');
const {interpretMarks}=require('../cn/item-semantics');
test('tablet bottom digit is remaining uses, never stack count',()=>{
 const r=interpretMarks('tablet',{bottomArabic:9});
 assert.equal(r.quantity,null);assert.equal(r.remainingUses,9);
 const before=interpretMarks('tablet',{bottomArabic:9},{confirmedSingle:true});
 const after=interpretMarks('tablet',{bottomArabic:8},{confirmedSingle:true});
 assert.equal(after.quantity-before.quantity,0);assert.equal(after.remainingUses-before.remainingUses,-1);
});
test('roman grade is independent from stack count; unknown corners stay pending',()=>{
 assert.deepEqual(interpretMarks('material',{topArabic:3,romanGrade:'XVII'},{quantityCorner:'top'}),
 {quantity:3,remainingUses:null,grade:'XVII',pending:[]});
 assert.equal(interpretMarks('unknown',{bottomArabic:10}).quantity,null);
});
