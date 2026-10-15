'use strict';
function acceptedMark(attempts,options={}) {
  const votes=attempts.filter(a=>typeof a.text==='string' && a.text.trim());
  if (!votes.length) return {arabic:null,roman:null,pending:true};
  const texts=new Set(votes.map(a=>a.text.trim()));
  if(texts.size!==1 || !votes.some(a=>a.confidence>=(options.minimumConfidence??85))) return {arabic:null,roman:null,pending:true};
  const text=votes[0].text.trim();
  if(/^[1-9]\d{0,5}$/.test(text)) return {arabic:Number(text),roman:null,pending:false};
  if(/^(?:X{0,3})(?:IX|IV|V?I{0,3})$/.test(text)) return {arabic:null,roman:text,pending:false};
  return {arabic:null,roman:null,pending:true};
}
function combineMarks(primary,alternate){
 const value=m=>m.arabic!=null?'n:'+m.arabic:m.roman?'r:'+m.roman:null;
 const a=value(primary),b=value(alternate);
 if(a&&b&&a!==b)return {arabic:null,roman:null,pending:true};
 return a?primary:b?alternate:{arabic:null,roman:null,pending:true};
}
module.exports={acceptedMark,combineMarks};
