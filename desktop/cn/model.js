(function (root) {
  'use strict';
  function signature(rgba, width, height) {
    const result = [];
    // Ignore stack digits at the top. Compare a normalized icon region.
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const sx = Math.min(width - 1, Math.floor((x + .5) * width / 12));
      const sy = Math.min(height - 1, Math.floor((.3 + (y + .5) / 12 * .65) * height));
      const i = (sy * width + sx) * 4;
      result.push(rgba[i], rgba[i + 1], rgba[i + 2]);
    }
    return result;
  }
  function match(sample, templates, threshold = 24, margin = 5) {
    const scores = templates.map(t => ({ template: t, distance: t.signature.reduce((s, v, i) => s + Math.abs(v - sample[i]), 0) / sample.length })).sort((a,b) => a.distance-b.distance);
    if (!scores.length || scores[0].distance > threshold || (scores[1] && scores[1].distance - scores[0].distance < margin)) return null;
    return scores[0];
  }
  function quantities(rows) {
    const totals = Object.create(null);
    for (const row of rows) {
      if (!row.id || !Number.isSafeInteger(row.quantity) || row.quantity < 0) throw new Error('数量必须是非负整数');
      totals[row.id] = (totals[row.id] || 0) + row.quantity;
    }
    return totals;
  }
  function calculate(before, after, templates, cost) {
    if (!Number.isFinite(cost) || cost < 0) throw new Error('投入必须是非负数');
    const a = quantities(before), b = quantities(after);
    const items = [...new Set([...Object.keys(a), ...Object.keys(b)])].map(id => {
      const t = templates.find(t => t.id === id);
      if (!t || !Number.isFinite(t.price) || t.price < 0) throw new Error('请补齐国服单价');
      const quantity = (b[id] || 0) - (a[id] || 0);
      return { id, name: t.name, quantity, price: t.price, value: quantity * t.price };
    });
    const change = items.reduce((s, item) => s + item.value, 0);
    return { items, change, cost, net: change - cost };
  }
  function localDay(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  const api = { signature, match, quantities, calculate, localDay };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CNModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
