 'use strict';
const fs=require('node:fs'),path=require('node:path'),{gzipSync,gunzipSync}=require('node:zlib'),{createHash,randomUUID}=require('node:crypto');
const {fileURLToPath,pathToFileURL}=require('node:url');
const URL_PREFIX='poe2-evidence-url:';
const MAGIC=Buffer.from('POE2BACKUP1\n'),PREFIX='poe2-evidence:';
const digest=b=>createHash('sha256').update(b).digest('hex');
const safeKey=k=>typeof k==='string'&&k.length<1024&&!k.includes('\\')&&!k.includes(':')&&!k.split('/').some(p=>!p||p==='.'||p==='..')&&k.endsWith('.png');
function write(file,state,options){
 const tmp=file+'.tmp';
 if(!options?.directory){fs.writeFileSync(tmp,JSON.stringify(state));fs.renameSync(tmp,file);return {files:0,missing:0};}
 const root=path.resolve(options.directory,'scans')+path.sep,files=new Map(),missing=new Set();
 const json=JSON.stringify(state,(_key,v)=>{if(typeof v!=='string'||!v.toLowerCase().endsWith('.png'))return v;const uri=v.startsWith('file:'),source=uri?fileURLToPath(v):v;let absolute=path.resolve(source);if(!absolute.toLowerCase().startsWith(root.toLowerCase())){const marker='/data/backpack/scans/',normalized=source.replaceAll(String.fromCharCode(92),'/'),index=normalized.toLowerCase().indexOf(marker);if(!uri||index<0)return v;absolute=path.resolve(root,normalized.slice(index+marker.length));}if(!absolute.toLowerCase().startsWith(root.toLowerCase()))throw Error('截图路径超出数据目录');const key=path.relative(root,absolute).split(path.sep).join('/');if(!safeKey(key))throw Error('截图路径无效');if(fs.existsSync(absolute)){const real=fs.realpathSync(absolute);if(!real.toLowerCase().startsWith(root.toLowerCase()))throw Error('截图路径超出数据目录');files.set(key,absolute);}else missing.add(key);return (uri?URL_PREFIX:PREFIX)+key;});
 const header=gzipSync(Buffer.from(JSON.stringify({state:JSON.parse(json),missing:[...missing]}))),fd=fs.openSync(tmp,'w');
 const uint=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);fs.writeSync(fd,b);};
 try{fs.writeSync(fd,MAGIC);uint(header.length);fs.writeSync(fd,header);uint(files.size);for(const [key,source]of files){const bytes=fs.readFileSync(source),meta=Buffer.from(JSON.stringify({key,size:bytes.length,sha256:digest(bytes)}));uint(meta.length);fs.writeSync(fd,meta);fs.writeSync(fd,bytes);}}finally{fs.closeSync(fd);}
 fs.renameSync(tmp,file);return {files:files.size,missing:missing.size};
}
function read(file,validate,options){
 const fd=fs.openSync(file,'r');let offset=0;
 const take=n=>{if(!Number.isSafeInteger(n)||n<0||offset+n>fs.fstatSync(fd).size)throw Error('备份文件不完整');const b=Buffer.alloc(n);let done=0;while(done<n){const size=fs.readSync(fd,b,done,n-done,offset+done);if(!size)throw Error('备份文件不完整');done+=size;}offset+=n;return b;};
 const uint=()=>take(4).readUInt32LE();
 try{
  if(!take(Math.min(MAGIC.length,fs.fstatSync(fd).size)).equals(MAGIC)){const state=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));validate(state);return state;}
  if(!options?.directory)throw Error('恢复含截图备份需要指定数据目录');
  const header=JSON.parse(gunzipSync(take(uint())).toString('utf8'));if(!header?.state||!Array.isArray(header.missing))throw Error('备份头无效');validate(header.state);
  const count=uint(),entries=[],keys=new Set();if(count>100000)throw Error('备份截图数无效');
  for(let i=0;i<count;i++){const length=uint();if(length>65536)throw Error('截图目录无效');const meta=JSON.parse(take(length).toString('utf8'));if(!safeKey(meta.key)||keys.has(meta.key)||!Number.isSafeInteger(meta.size)||meta.size<0||meta.size>268435456)throw Error('截图目录无效');keys.add(meta.key);const start=offset,bytes=take(meta.size);if(digest(bytes)!==meta.sha256)throw Error('截图校验失败，原数据未替换');entries.push({...meta,offset:start});}
  if(offset!==fs.fstatSync(fd).size)throw Error('备份尾部数据无效');
  const root=path.resolve(options.directory,'scans','restored-'+randomUUID());
  const state=JSON.parse(JSON.stringify(header.state),(_key,v)=>{if(typeof v!=='string'||!v.startsWith(PREFIX)&&!v.startsWith(URL_PREFIX))return v;const uri=v.startsWith(URL_PREFIX),key=v.slice((uri?URL_PREFIX:PREFIX).length);if(!safeKey(key))throw Error('备份截图路径无效');const target=path.join(root,...key.split('/'));return uri?pathToFileURL(target).href:target;});validate(state);
  for(const entry of entries){const target=path.join(root,...entry.key.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});offset=entry.offset;fs.writeFileSync(target,take(entry.size));}
  if(header.missing.length)options.onWarning?.('备份中有 '+header.missing.length+' 个原已缺失的截图文件，数量记录保留');
  return state;
 }finally{fs.closeSync(fd);}
}
module.exports={write,read};
