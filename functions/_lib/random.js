// Tirage pseudo-aléatoire déterministe, repris à l'identique de l'ancien
// backend Google Apps Script (mulberry32 + hash du nom+token comme graine) :
// même graine → même tirage, reproductible, mais différent d'un participant
// à l'autre et différent après chaque violation (nouvelle graine).
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function seededShuffledIds(seedStr, count, bank) {
  const rand = mulberry32(hashString(seedStr));
  const ids = bank.map(q => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}
