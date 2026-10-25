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
 * `tilt` 0..1 blends the flat view (0) into the tilted one (1).
 */
export function cameraFor(viewW, viewH, focusX, focusY, tilt = 1, { pitch = 40, dist = 330 } = {}) {
  const p = 90 + (pitch - 90) * tilt;
  let zoom = Math.max(Math.min(viewW / 340, viewH / 230), viewH / 460);
  for (let i = 0; i < 16; i++) {
    const cam = makeCamera({ focusX, focusY, pitch: p, dist, focal: zoom * dist, cx: viewW / 2, cy: viewH * (0.5 + 0.06 * tilt) });
    const top = groundRow(cam, 0);
    if (top && focusY - top.y <= MAX_REACH) return cam;
    zoom *= 1.06;
  }
  return makeCamera({ focusX, focusY, pitch: p, dist, focal: zoom * dist, cx: viewW / 2, cy: viewH * (0.5 + 0.06 * tilt) });
}
