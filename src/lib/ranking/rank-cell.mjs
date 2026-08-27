/**
 * Cell model for the Excel-style ranking grid: a plain position number plus a
 * colored movement arrow (green = improved, red = dropped) and the previous
 * position in parentheses. Never-ranked renders as muted text, no fill; a
 * keyword that HAD a position and fell out of the top 100 is 'lost' — the worst
 * possible move, so it gets its own flagged state instead of the muted one.
 *
 * @param {number|null} position current position (1..100) or null = not in top 100
 * @param {number|null} prev previous week's position or null
 * @returns {{label:string, ranked:boolean, dir:'up'|'down'|'new'|'lost'|'none', prev:number|null}}
 */
export function rankCell(position, prev) {
  const ranked = position != null;
  const label = ranked ? String(position) : "Not in top 100";
  let dir = "none";
  if (ranked) {
    if (prev == null) dir = "new";
    else if (position < prev) dir = "up";
    else if (position > prev) dir = "down";
  } else if (prev != null) {
    dir = "lost";
  }
  // Show "(prev)" when a ranked cell actually moved — and always for a lost one,
  // since "was #4" is the whole point of flagging the loss.
  const showPrev = prev != null && (dir === "lost" || (ranked && position !== prev)) ? prev : null;
  return { label, ranked, dir, prev: showPrev };
}
