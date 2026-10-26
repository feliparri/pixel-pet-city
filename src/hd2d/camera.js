// The tilted camera of the HD-2D lite view: pure maths, no canvas. The ground is a plane seen from above and behind (yaw 0: map north is
// "away"), so every screen row is a horizontal line of the ground at one depth: that is what lets the renderer draw the ground one
// scaled row at a time (Mode 7) and what makes things standing upright (billboards) scale by 1 / depth.
//
// World units are map pixels (16 per tile). The camera looks at the ground point (focusX, focusY), which lands on screen point (cx, cy):
//   pitch  angle of the view down from the horizon in degrees (90 = straight down, the flat game view)
//   dist   distance from the camera to the focus point, in world px (smaller = stronger perspective)
//   focal  focal length in screen px (focal / dist = screen px per world px at the focus)
export const TILE = 16;
const RAD = Math.PI / 180;

export function makeCamera({ focusX, focusY, pitch = 42, dist = 300, focal = 1000, cx = 0, cy = 0 }) {
  const th = pitch * RAD, sin = Math.sin(th), cos = Math.cos(th);
  return { focusX, focusY, pitch, dist, focal, cx, cy, sin, cos, back: dist * cos, height: dist * sin };
}

/** Depth along the view axis of a world point (z = height above the ground). Larger = further from the camera. */
export function depthOf(cam, wx, wy, wz = 0) {
  return (cam.focusY - wy + cam.back) * cam.cos + (cam.height - wz) * cam.sin;
}

/** World point -> screen: { x, y, depth, scale }, scale = screen px per world px at that depth. null when it is behind the camera. */
export function project(cam, wx, wy, wz = 0) {
  const depth = depthOf(cam, wx, wy, wz);
  if (depth <= 1e-6) return null;
  const a = cam.focusY - wy + cam.back;
  const up = a * cam.sin + (wz - cam.height) * cam.cos;
  const scale = cam.focal / depth;
  return { x: cam.cx + (wx - cam.focusX) * scale, y: cam.cy - up * scale, depth, scale };
}

/** Where a point `wz` above the ground point (wx, wy) is drawn on an upright sprite standing there: straight up from the foot by wz * scale (a billboard is not foreshortened). */
export function standAt(cam, wx, wy, wz = 0) {
  const p = project(cam, wx, wy);
  return p && { x: p.x, y: p.y - wz * p.scale, depth: p.depth, scale: p.scale };
}

/** Screen px per world px for something standing at (wx, wy): how big an upright sprite is drawn. */
export const billboardScale = (cam, wx, wy) => cam.focal / depthOf(cam, wx, wy, 0);

/** Where the ray through a screen point meets the ground: { x, y } in world px, or null above the horizon. */
export function unproject(cam, sx, sy) {
  const row = groundRow(cam, sy);
  return row ? { x: cam.focusX + (sx - cam.cx) * row.perPx, y: row.y } : null;
}

/** The ground line seen on screen row `sy`: { y (world), perPx (world px per screen px along the row) }, or null above the horizon. */
export function groundRow(cam, sy) {
  const yn = (cam.cy - sy) / cam.focal;
  const gf = cam.cos + cam.sin * yn, gu = -cam.sin + cam.cos * yn;      // the ray along the ground and up
  if (gu >= -1e-9) return null;
  const t = -cam.height / gu;
  return { y: cam.focusY - (-cam.back + t * gf), perPx: t / cam.focal };
}

/** Screen position of the middle of a tile (or null). */
export function tileToScreen(cam, tx, ty) {
  return project(cam, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
}

/** The tile under a screen point: [tx, ty], or null above the horizon. */
export function screenToTile(cam, sx, sy) {
  const w = unproject(cam, sx, sy);
  return w ? [Math.floor(w.x / TILE), Math.floor(w.y / TILE)] : null;
}

/** Back to front: items with a `depth` (see depthOf), the furthest first; equal depths keep their `order` then their input order. */
export function sortBackToFront(items) {
  return items.map((it, i) => [it, i]).sort((p, q) => q[0].depth - p[0].depth || (p[0].order || 0) - (q[0].order || 0) || p[1] - q[1]).map((p) => p[0]);
}

/** A sprite's scale snapped to a whole number of screen px per art px (at least 1): every art pixel then covers the same square. */
export const snapScale = (s) => Math.max(1, Math.round(s));

/** A pet's pixel size on screen: PET_SCALE of the world's scale at its feet, whole (at least 1), so a pet is about 2/3 the size it was against the world around it. */
export const PET_SCALE = 2 / 3;
export const petScale = (s) => snapScale(s * PET_SCALE);
/** Every pet's pixel size in a frame: the world's scale at the focus point (the depth there is `dist`), so a pet keeps one size wherever it stands instead of growing as it walks toward the screen. */
export const petScaleOf = (cam) => petScale(cam.focal / cam.dist);

/** A phone shows this many times more of the world than the camera framed before (1.5 times the tiles each way). */
export const PHONE_OUT = 1.5;

/** The camera's focus snapped to whole screen pixels at the focus depth, so the ground does not crawl by fractions of a pixel as the camera glides. */
export function snapFocus(cam, focusX, focusY) {
  const z = cam.focal / cam.dist;
  return [Math.round(focusX * z) / z, Math.round(focusY * z) / z];
}

/**
 * The tiles that are fully on screen with a margin: { x0, y0, x1, y1 } inclusive, the rectangle between the bottom row's width (the
 * narrowest) and the rows 14% in from the top and bottom; the top gets two more tiles of room for a pet's height. Null if it is tiny.
 */
export function visibleTiles(cam, viewW, viewH) {
  const top = unproject(cam, viewW / 2, viewH * 0.14), bottom = unproject(cam, viewW / 2, viewH * 0.86);
  const left = unproject(cam, viewW * 0.1, viewH * 0.86), right = unproject(cam, viewW * 0.9, viewH * 0.86);
  if (!top || !bottom || !left || !right) return null;
  const box = { x0: Math.ceil(left.x / TILE), x1: Math.floor(right.x / TILE) - 1, y0: Math.ceil(top.y / TILE) + 2, y1: Math.floor(bottom.y / TILE) - 1 };
  return box.x1 - box.x0 >= 2 && box.y1 - box.y0 >= 2 ? box : null;
}

export const MAX_REACH = 680;      // the furthest north (world px beyond the focus) the top row of the screen may show

/**
 * The camera for a view: a zoom that frames about 20 tiles across (more on a tall phone screen: it zooms in until the top row no longer
 * reaches past MAX_REACH, so a portrait view does not stretch towards the horizon), the focus point a little below the middle.
 * `out` (1 or more) zooms out: the view frames `out` times more of the world each way (the reach limit grows with it). `tilt` 0..1 blends the flat view (0) into the tilted one (1). `ref` is how many world px tall the view frames at the focus (smaller = bigger pets).
 */
export function cameraFor(viewW, viewH, focusX, focusY, tilt = 1, { pitch = 40, dist = 330, ref = 230, out = 1 } = {}) {
  const p = 90 + (pitch - 90) * tilt;
  let zoom = Math.max(Math.min(viewW / 340, viewH / ref), viewH / 460) / out;
  for (let i = 0; i < 16; i++) {
    const cam = makeCamera({ focusX, focusY, pitch: p, dist, focal: zoom * dist, cx: viewW / 2, cy: viewH * (0.5 + 0.06 * tilt) });
    const top = groundRow(cam, 0);
    if (top && focusY - top.y <= MAX_REACH * out) return cam;
    zoom *= 1.06;
  }
  return makeCamera({ focusX, focusY, pitch: p, dist, focal: zoom * dist, cx: viewW / 2, cy: viewH * (0.5 + 0.06 * tilt) });
}

/**
 * Where the focus may be so the view stays on a map of mapW x mapH world px: { x0, x1, y0, y1 } (a map smaller than the view gives its
 * middle). The camera only translates, so the extents of the view around the focus are taken from `cam` as it is: the sides at the row
 * 20% down (the top rows are far and fogged, a little past the edge there does no harm) and the north and south from the first and last rows.
 */
export function focusBounds(cam, viewW, viewH, mapW, mapH, northSlack = 48) {
  const tl = unproject(cam, 0, viewH * 0.2), tr = unproject(cam, viewW, viewH * 0.2), top = groundRow(cam, 0), bottom = groundRow(cam, viewH - 1);
  const left = tl ? cam.focusX - tl.x : 0, right = tr ? tr.x - cam.focusX : 0;
  const north = top ? Math.max(0, cam.focusY - top.y - northSlack) : MAX_REACH, south = bottom ? Math.max(0, bottom.y - cam.focusY) : 0;
  const span = (lo, hi, size) => (lo > size - hi ? [size / 2, size / 2] : [lo, size - hi]);
  const [x0, x1] = span(left, right, mapW), [y0, y1] = span(north, south, mapH);
  return { x0, x1, y0, y1 };
}

/**
 * Where the camera's focus goes to follow a player standing at world (px, py) (the feet): inside `focusBounds` so the view stays on the
 * map, except where that would push the player toward the edge of the screen: then the focus moves back toward the player just far enough
 * that the player stays inside a margin of the view (what lies beyond the map's edge is only fog and darkness). `opts` are the cameraFor options.
 */
export function followFocus(viewW, viewH, px, py, mapW, mapH, opts = {}, margin = { x: 0.1, top: 0.06, bottom: 0.1 }) {
  const probe = cameraFor(viewW, viewH, mapW / 2, mapH / 2, 1, opts), b = focusBounds(probe, viewW, viewH, mapW, mapH);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cx = clamp(px, b.x0, b.x1), cy = clamp(py, b.y0, b.y1);
  const inside = (fx, fy) => {
    const p = project(cameraFor(viewW, viewH, fx, fy, 1, opts), px, py);
    return !!p && p.x >= viewW * margin.x && p.x <= viewW * (1 - margin.x) && p.y - 34 * p.scale >= viewH * margin.top && p.y <= viewH * (1 - margin.bottom);
  };
  if (inside(cx, cy)) return { x: cx, y: cy };
  let lo = 0, hi = 1;                                                    // the least step towards the player that keeps it in view (hi = 1 is the player itself)
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (inside(cx + (px - cx) * mid, cy + (py - cy) * mid)) hi = mid; else lo = mid; }
  return { x: cx + (px - cx) * hi, y: cy + (py - cy) * hi };
}
