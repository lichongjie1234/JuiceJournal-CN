'use strict';
// Interpretation follows item metadata, never the location of a digit alone.
function interpretMarks(kind, marks, policy = {}) {
  const integer = v => Number.isSafeInteger(v) && v > 0;
  const top = integer(marks.topArabic) ? marks.topArabic : null;
  const bottom = integer(marks.bottomArabic) ? marks.bottomArabic : null;
  const result = {quantity:null, remainingUses:null, grade:marks.romanGrade || null, pending:[]};
  if (kind === 'tablet') {
    result.remainingUses = bottom;
    result.quantity = top;
    if (top == null && policy.confirmedSingle === true) result.quantity = 1;
    if (result.quantity == null) result.pending.push('quantity');
    if (bottom == null) result.pending.push('remaining_uses');
    return result;
  }
  if (policy.quantityCorner === 'top') result.quantity = top;
  else if (policy.quantityCorner === 'bottom') result.quantity = bottom;
  else result.pending.push('quantity_position');
  if (result.quantity == null) result.pending.push('quantity');
  return result;
}
module.exports = {interpretMarks};
