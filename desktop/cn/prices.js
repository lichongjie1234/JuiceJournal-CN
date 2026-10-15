'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const SOURCE = 'https://poecurrency.top';
const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
function normalize(groups, seasons, fetchedAt = new Date().toISOString()) {
  if (!Array.isArray(seasons) || !seasons.length || typeof seasons[0] !== 'string') throw Error('无法确认当前赛季');
  if (!Array.isArray(groups) || !groups.length) throw Error('物价响应无效');
  const rows = groups.flatMap(g => {
    if (!Array.isArray(g.items)) throw Error('物价分类无效');
    return g.items.map(i => ({...i, category: g.category_label}));
  });
  const rate = rows.find(i => i.engname === 'Divine Orb' && i.currency_unit === 'e');
  // The provider exposes two sides. Keep both; selecting a liquidation side
  // requires verifying the in-game market perspective, never silently invert it.
  return {schema: 1, source: SOURCE, season: seasons[0], fetchedAt,
    directionVerified: false, rates: rate ? {buy: rate.buy_avg, sell: rate.sell_avg, at: rate.latest_datetime, error: rate.error} : null,
    items: rows.map(i => ({id: `${i.category}\u001f${i.engname || i.item_name}`, name: i.item_name,
      english: i.engname, icon: i.item_icon, unit: i.currency_unit, buy: i.buy_avg, sell: i.sell_avg,
      at: i.latest_datetime, error: Boolean(i.error), errorInfo: i.error_info || ''}))};
}
function quote(snapshot, id, side, now = Date.now()) {
  if (!['buy','sell'].includes(side)) throw Error('请选择报价方向');
  const item = snapshot.items.find(i => i.id === id);
  const result = {id, valueE: null, reasons: [], source: snapshot.source, season: snapshot.season, side};
  if (!item) {result.reasons.push('missing'); return result;}
  const stale = at => !at || !Number.isFinite(Date.parse(at + '+08:00')) || now - Date.parse(at + '+08:00') > 86400000 || Date.parse(at + '+08:00') - now > 300000;
  if (!snapshot.directionVerified) result.reasons.push('direction_unverified');
  if (item.error) result.reasons.push('anomaly');
  if (stale(item.at)) result.reasons.push('stale');
  if (!positive(item[side])) result.reasons.push('missing');
  let factor = 1;
  if (item.unit === 'd') {
    const r = snapshot.rates;
    if (!r || !positive(r[side]) || r.error || stale(r.at)) result.reasons.push('invalid_exchange_rate');
    else factor = r[side];
  } else if (item.unit !== 'e') result.reasons.push('unsupported_unit');
  if (!result.reasons.length) result.valueE = item[side] * factor;
  return result;
}
class PriceService {
  constructor(directory, fetcher = fetch) {this.directory = directory; this.fetcher = fetcher; this.inflight = null;}
  async json(endpoint) {
    const r = await this.fetcher(SOURCE + endpoint, {signal: AbortSignal.timeout(20000)});
    if (!r.ok) throw Error(`价格接口 HTTP ${r.status}`);
    return r.json();
  }
  async sync() {
    if (this.inflight) return this.inflight;
    this.inflight = this.update().finally(() => {this.inflight = null;});
    return this.inflight;
  }
  async update() {
    const file = path.join(this.directory, 'prices.json');
    try {
      const before = await this.json('/api/season_list?version=poe2');
      const groups = await this.json('/api/summary?version=2');
      const after = await this.json('/api/season_list?version=poe2');
      if (before[0] !== after[0]) throw Error('同步期间发生赛季切换，请重试');
      const snapshot = normalize(groups, after);
      await fs.mkdir(this.directory, {recursive:true});
      await fs.writeFile(file + '.tmp', JSON.stringify(snapshot));
      await fs.rename(file + '.tmp', file);
      return {snapshot, offline:false};
    } catch (error) {
      try {const snapshot = JSON.parse(await fs.readFile(file, 'utf8')); return {snapshot, offline:true, warning:error.message};}
      catch {throw error;}
    }
  }
  start(onUpdate) {this.stop(); const tick = () => this.sync().then(onUpdate).catch(e => onUpdate({error:e.message})); tick(); this.timer = setInterval(tick, 3600000); return () => this.stop();}
  stop() {if (this.timer) clearInterval(this.timer); this.timer = null;}
}
module.exports = {normalize, quote, PriceService};
