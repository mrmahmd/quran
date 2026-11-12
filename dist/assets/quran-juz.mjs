import { monthlyRangeText, SURAHS } from './monthly-model.mjs?v=monthly-save2';

// Tanzil Quran Metadata (CC BY), https://tanzil.net/docs/quran_metadata
// Each pair is the opening surah and ayah of the corresponding juz.
const juzStarts = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148],
  [5, 82], [6, 111], [7, 88], [8, 41], [9, 93], [11, 6],
  [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1],
  [25, 21], [27, 56], [29, 46], [33, 31], [36, 28], [39, 32],
  [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

const offsets = [0];
for (const { verses } of SURAHS) offsets.push(offsets.at(-1) + verses);
const verseIndex = (surah, ayah) => offsets[surah - 1] + ayah;
const juzBoundaries = juzStarts.map(([surah, ayah]) => verseIndex(surah, ayah));
juzBoundaries.push(offsets.at(-1) + 1);

export function recordedAyahRanges(value) {
  if (value?.absent) return null;
  const text = typeof value?.text === 'string' ? value.text.trim() : '';
  if (value?.none === true && !text) return [];
  const range = value?.range;
  const label = monthlyRangeText(range);
  if (value?.none !== false || !label || text !== label) return null;

  const { from_surah: from, to_surah: to, from_ayah: first, to_ayah: last } = range;
  if (from <= to) return [[verseIndex(from, first), verseIndex(to, last)]];
  // A descending selection still reads the ayat of each surah forward.
  return [
    [verseIndex(to, 1), verseIndex(to, last)],
    [offsets[to] + 1, offsets[from - 1]],
    [verseIndex(from, first), offsets[from]],
  ].filter(([start, end]) => start <= end);
}

export function completedJuz(ranges) {
  const merged = [];
  for (const [start, end] of ranges.slice().sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1] + 1) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return juzStarts.flatMap((_, index) => merged.some(([start, end]) =>
    start <= juzBoundaries[index] && end >= juzBoundaries[index + 1] - 1) ? [index + 1] : []);
}
