'use strict';
function acceptedMark(attempts) {
  const votes=attempts.filter(a=>typeof a.text==='string' && a.text.trim());
  if (!votes.length) return {arabic:null,roman:null,pending:true};
  const texts=new Set(votes.map(a=>a.text.trim()));
  if(texts.size!==1 || !votes.some(a=>a.confidence>=85)) return {arabic:null,roman:null,pending:true};
  const text=votes[0].text.trim();
  if(/^[1-9]\d{0,5}$/.test(text)) return {arabic:Number(text),roman:null,pending:false};
  if(/^(?:X{0,3})(?:IX|IV|V?I{0,3})$/.test(text)) return {arabic:null,roman:text,pending:false};
  return {arabic:null,roman:null,pending:true};
}
module.exports={acceptedMark};
