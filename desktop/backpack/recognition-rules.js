'use strict';
function distance(a,b){if(!Array.isArray(a)||a.length!==b?.length||!a.length)return Infinity;return a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length/255;}
function matching(cell,rules){const candidates=rules.filter(r=>(!cell.bank?.confidentIcon||!cell.bank.items?.length||cell.bank.items.some(i=>i.id===r.id)||(r.sourceCatalogIds?.length&&cell.bank.items.every(i=>r.sourceCatalogIds.includes(i.id))&&r.sourceCatalogIds.length===cell.bank.items.length))&&distance(cell.identitySignature,r.signature)<(r.excluded?.018:.03) && (r.kind==='tablet'||r.ignoreBadge||distance(cell.badgeSignature,r.badge)<.065)).map(r=>({rule:r,d:distance(cell.identitySignature,r.signature)})).sort((a,b)=>a.d-b.d);
 if(!candidates.length)return null;const best=candidates[0];if(candidates.some(c=>c.d-best.d<.012&&c.rule.id!==best.rule.id))return null;return best.rule;}
function ruleFor(cell){if(!cell.confirmed||!cell.identitySignature||(!cell.excluded&&(!cell.id||!cell.name||!Number.isSafeInteger(cell.quantity))))return null;let corner=null;
 const kind=/石板/.test(cell.name||'')?'tablet':/引路石|阶地图|地图.*阶/.test(cell.name||'')?'map':cell.kind;
 if(cell.topMark?.arabic===cell.quantity||cell.topMark?.attempts?.some(a=>a.text===String(cell.quantity)))corner='top';
 else if(cell.kind!=='tablet'&&(cell.bottomMark?.arabic===cell.quantity||cell.bottomMark?.attempts?.some(a=>a.text===String(cell.quantity))))corner='bottom';
 return {sourceCatalogIds:cell.bank?.confidentIcon?cell.bank.items.map(i=>i.id):undefined,id:cell.id,name:cell.name,grade:cell.grade||'',kind,icon:cell.icon,signature:cell.identitySignature,badge:cell.badgeSignature,ignoreBadge:!cell.grade&&Boolean(cell.bottomMark?.arabic),quantityCorner:corner||(kind==='material'?'top':null),single:['map','tablet'].includes(kind)&&cell.quantity===1,excluded:Boolean(cell.excluded)};}
function applyRule(cell,rule){if(!rule)return cell;Object.assign(cell,{id:rule.id,name:rule.name,grade:rule.grade,kind:rule.kind});
 if(rule.excluded){cell.excluded=true;cell.confirmed=true;cell.recognitionSource='已排除的物品';return cell;}
 cell.quantity=rule.single?1:rule.quantityCorner==='top'?cell.topMark?.arabic:rule.quantityCorner==='bottom'?cell.bottomMark?.arabic:null;
 if(rule.kind==='tablet')cell.remainingUses=cell.bottomMark?.arabic??null;
 cell.confirmed=Number.isSafeInteger(cell.quantity)&&cell.quantity>0;cell.recognitionSource='已核对的图标规则';return cell;}
module.exports={distance,matching,ruleFor,applyRule};
