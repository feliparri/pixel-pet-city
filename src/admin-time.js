// Date and time of a show as the owner thinks of it: the wall clock of a time zone (America/Santiago by default), turned into the UTC
// instant the server stores, and back. Pure functions over Intl; no libraries.
export const ZONE = 'America/Santiago';

/** The zone's offset from UTC in minutes at the UTC instant `ms` (Santiago: -180 in summer, -240 in winter). */
export function zoneOffset(ms, zone = ZONE) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The UTC time (ms) at which the zone's clock reads `date` ('YYYY-MM-DD') and `time` ('HH:MM'); NaN when they are not a real date and time. */
export function zonedToMs(date, time, zone = ZONE) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ''), t = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!d || !t) return NaN;
  const [y, mo, da, h, mi] = [...d.slice(1), ...t.slice(1)].map(Number);
  const naive = Date.UTC(y, mo - 1, da, h, mi);
  if (new Date(naive).getUTCMonth() !== mo - 1 || h > 23 || mi > 59) return NaN;
  let ms = naive - zoneOffset(naive, zone) * 60000;
  ms = naive - zoneOffset(ms, zone) * 60000;                       // once more: the offset is the one at the result, near a clock change
  return ms;
}

/** The zone's wall clock at `ms` as { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
export function msToZoned(ms, zone = ZONE) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** "dom 26 oct, 21:30" in the zone, for the list. */
export function labelZoned(ms, zone = ZONE) {
  return new Intl.DateTimeFormat('es-CL', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

/** How long until `ms`, in words ("en 2 h 5 min", "en curso", "hace 3 min"). */
export function untilText(ms, now, runningMs = 0) {
  const d = Math.round((ms - now) / 1000);
  if (d <= 0 && now < ms + runningMs) return 'en curso';
  if (d <= 0) return 'terminó';
  if (d < 90) return `en ${d} s`;
  const m = Math.round(d / 60);
  if (m < 120) return `en ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return `en ${h} h${r ? ` ${r} min` : ''}`;
  return `en ${Math.round(h / 24)} días`;
}
