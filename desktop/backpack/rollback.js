'use strict';
const {createHash}=require('node:crypto');
const keys=['ledger','pendingScans','draft','lastScanReceipt','trackedIds','learned','visualRules','exclusions','exactReviewed','quantityCorrections'];
const labels={recordPrice:'补录本笔单价',defer:'暂存扫描',resolvePending:'确认待定扫描',commit:'保存扫描',scanDecision:'保存扫描',discard:'放弃扫描',editLatest:'修改数量',clearRecords:'清除记录',tracked:'修改统计清单',forgetRecognition:'忘记识别规则',removeExclusion:'恢复排除物品',resetTimer:'重置计时',pause:'暂停或继续计时',end:'结束本轮',deleteRecord:'删除库存变化',map:'记录开图',mapMinus:'减少地图',mapCount:'修正图数',income:'添加收入',deleteIncome:'删除收入',cost:'追加成本',editCost:'修改成本'};
function capture(state,copy=true){const result={};for(const key of keys)if(Object.hasOwn(state,key))result[key]=copy?structuredClone(state[key]):state[key];return result;}
function hash(snapshot){return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');}
function restore(state,snapshot){for(const key of keys){if(Object.hasOwn(snapshot,key))state[key]=structuredClone(snapshot[key]);else delete state[key];}}
function checkpoint(before,state,label){const afterHash=hash(capture(state,false));return afterHash===hash(before)?null:{version:1,label,at:Date.now(),before,afterHash};}
function matches(entry,state){return entry?.version===1&&entry.before&&entry.afterHash===hash(capture(state,false));}
module.exports={capture,restore,checkpoint,matches,labels};
