/**
 * @param {number|null} position current position (1..100) or null = not in top 100
 * @param {number|null} prev previous week's position or null
 * @returns {{label:string,color:'green'|'amber'|'red',dir:'up'|'down'|'new'|'none',delta:number|null}}
 */
export function rankCell(position, prev) {
  const color = position == null ? "red" : position <= 10 ? "green" : "amber";
  const label = position == null ? "—" : String(position);
  let dir = "none";
  let delta = null;
  if (position == null && prev != null) {
    dir = "down";
  } else if (position != null && prev == null) {
    dir = "new";
  } else if (position != null && prev != null && position !== prev) {
    if (position < prev) { dir = "up"; delta = prev - position; }
    else { dir = "down"; delta = position - prev; }
  }
  return { label, color, dir, delta };
}
