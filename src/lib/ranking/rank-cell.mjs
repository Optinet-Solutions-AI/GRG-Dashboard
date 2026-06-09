/**
 * Cell model for the Excel-style ranking grid: a plain position number plus a
 * colored movement arrow (green = improved, red = dropped) and the previous
 * position in parentheses. Not-in-top-100 renders as muted text, no fill.
 *
 * @param {number|null} position current position (1..100) or null = not in top 100
 * @param {number|null} prev previous week's position or null
 * @returns {{label:string, ranked:boolean, dir:'up'|'down'|'new'|'none', prev:number|null}}
 */
export function rankCell(position, prev) {
  const ranked = position != null;
  const label = ranked ? String(position) : "Not in top 100";
  let dir = "none";
  if (ranked) {
    if (prev == null) dir = "new";
    else if (position < prev) dir = "up";
    else if (position > prev) dir = "down";
  }
  // Only show "(prev)" when ranked and the position actually moved.
  const showPrev = ranked && prev != null && position !== prev ? prev : null;
  return { label, ranked, dir, prev: showPrev };
}
