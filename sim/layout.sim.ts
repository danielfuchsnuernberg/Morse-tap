/**
 * Adds up the fixed vertical space the Key screen needs, to prove the
 * Send button stays on screen even with the longest realistic guide.
 * Heights mirror the StyleSheet values.
 */
const SCREENS = [
  { name: 'iPhone SE',        height: 667, safeTop: 20, safeBottom: 0 },
  { name: 'iPhone 13 mini',   height: 812, safeTop: 50, safeBottom: 34 },
  { name: 'iPhone 15',        height: 852, safeTop: 59, safeBottom: 34 },
  { name: 'iPhone 17 Pro',    height: 874, safeTop: 62, safeBottom: 34 },
  { name: 'iPhone 17 Pro Max',height: 956, safeTop: 62, safeBottom: 34 },
];

// The status chip now sits beside the title, so it costs no extra height.
const header      = 30 + 10 + 42 + 8;   // title row (with chip) + gap + tabs + top padding
const connectBar  = 0;                  // collapsed into the header
const statusRow   = 0;
const guideChrome = 12 + 16 + 10 + 42 + 10 + 10 + 18 + 10 + 16 + 12; // panel minus the tiles
const rowsFor = (h: number) => (h >= 840 ? 3 : h >= 780 ? 2 : 1);
const draftBox    = 58 + 8 + 10;        // includes the gap above the key
const key         = 104 + 5 + 26 + 6;   // key + gap + status + margin
const actions     = 46 + 10;
const logMin      = 0;                  // allowed to collapse

const neededFor = (h: number) =>
  header + connectBar + statusRow + guideChrome + rowsFor(h) * 52 + draftBox + key + actions + logMin;

const problems: string[] = [];
for (const s of SCREENS) {
  const usable = s.height - s.safeTop - s.safeBottom;
  const needed = neededFor(s.height);
  const spare = usable - needed;
  const ok = spare >= 0;
  console.log(
    `${s.name.padEnd(20)} usable ${String(usable).padStart(4)}  rows ${rowsFor(s.height)}  needs ${needed}  spare ${spare > 0 ? '+' : ''}${spare}  ${ok ? 'OK' : 'OVERFLOW'}`
  );
  if (!ok) problems.push(`${s.name} overflows by ${-spare}pt`);
}

console.log('');
console.log(problems.length === 0
  ? 'PASS: Send stays on screen on every size, guide fully open'
  : 'FAIL:\n' + problems.join('\n'));
process.exit(problems.length ? 1 : 0);
