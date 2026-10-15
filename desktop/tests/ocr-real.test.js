const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {acceptedMark}=require('../cn/ocr-marks');
test('real backpack OCR accepts clear 9/10 and rejects misread scroll 5',()=>{
 const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ocr-result.json'),'utf8'));
 const expected={'bottom9.png':9,'bottom10.png':10,'scroll5.png':null,'gem7.png':null,'top14.png':null,'top20.png':null};
 for(const row of rows) assert.equal(acceptedMark(row.attempts).arabic,expected[row.file],row.file);
});
test('roman levels cannot enter quantity fields',()=>{
 assert.deepEqual(acceptedMark([{text:'XVII',confidence:95}]),{arabic:null,roman:'XVII',pending:false});
 assert.equal(acceptedMark([{text:'1',confidence:99},{text:'11',confidence:90}]).arabic,null);
});
