const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
function harness(){
 const filename=path.resolve(__dirname,'../backpack/main.js'),realRequire=createRequire(filename),files=new Map(),stats={recognize:0,workers:0},fakeFs={mkdirSync(){},existsSync:p=>files.has(p),readFileSync:p=>{if(!files.has(p))throw Error('missing');return files.get(p);},writeFileSync(){},copyFileSync(){},renameSync(){}};
 let parameters={},fail=false;const worker={setParameters:async p=>parameters=p,recognize:async p=>{stats.recognize++;if(fail){fail=false;throw Error('temporary OCR error');}const x=JSON.parse(files.get(p).toString());return{data:{text:x.text,confidence:x.confidence??99}};}};
 const app={commandLine:{appendSwitch(){}},setPath(){},requestSingleInstanceLock:()=>false,quit(){},on(){},isReady:()=>false};
 const context={require:n=>n==='electron'?{app,globalShortcut:{unregisterAll(){}}}:n==='node:fs'?fakeFs:n.endsWith('tesseract.js')?{createWorker:async()=>{stats.workers++;return worker;}}:realRequire(n),__dirname:path.dirname(filename),process:{argv:['node','--ui-test'],pid:1},structuredClone,Buffer,console,setTimeout,clearTimeout,setInterval};
 vm.createContext(context);vm.runInContext(fs.readFileSync(filename,'utf8')+'\nglobalThis.h={ocr,size:()=>ocrCache.size};',context);
 return {...context.h,stats,add:(name,text,confidence=99,extra='')=>files.set(name,Buffer.from(JSON.stringify({text,confidence,extra}))),fail:()=>fail=true};
}
test('OCR cache reuses exact image bytes across filenames and isolates caller mutations',async()=>{
 const h=harness();h.add('a','3');h.add('b','3');const first=await h.ocr('a','b');assert.equal(first.arabic,3);assert.equal(first.attempts.length,4);assert.equal(h.stats.recognize,2);assert.equal(h.stats.workers,1);
 first.attempts[0].text='99';const again=await h.ocr('b');assert.equal(again.arabic,3);assert.equal(again.attempts[0].text,'3');assert.equal(h.stats.recognize,2);
});
test('different images still run OCR and preserve variant conflict, confidence and Roman grade checks',async()=>{
 const h=harness();h.add('a','3');h.add('b','7');assert.equal((await h.ocr('a','b')).pending,true);assert.equal(h.stats.recognize,4);
 h.add('low','8',79);assert.equal((await h.ocr('low')).arabic,null);h.add('roman','IV');const roman=await h.ocr('roman');assert.equal(roman.roman,'IV');assert.equal(roman.arabic,null);
});
test('OCR failure is retryable and the cache remains bounded',async()=>{
 const h=harness();h.add('first','1');h.fail();await assert.rejects(h.ocr('first'),/temporary/);assert.equal(h.size(),0);assert.equal((await h.ocr('first')).arabic,1);
 for(let i=0;i<257;i++){h.add('p'+i,'2',99,String(i));await h.ocr('p'+i);}assert.equal(h.size(),256);const calls=h.stats.recognize;await h.ocr('first');assert.equal(h.stats.recognize,calls+2);
});
