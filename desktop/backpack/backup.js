'use strict';
const fs=require('node:fs');
function write(file,state){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state));fs.renameSync(tmp,file);}
function read(file,validate){const state=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));validate(state);return state;}
module.exports={write,read};
