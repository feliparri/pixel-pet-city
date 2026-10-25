// Who is seen from where: pets share the screen only when they are in the same area. A pet in the shop or on the farm is not drawn in the
// town (and the other way round), exactly as the area field of its position messages says (protocol.js, net.js).

/** The peers (placed ones only) that are in `area`: [{ area, placed, ... }]. */
export const inArea = (peers, area) => Array.from(peers).filter((p) => p.placed && p.area === area);
