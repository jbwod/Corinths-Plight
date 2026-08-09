export interface SeededRandom {
  next(): number;
  integer(minimum: number, maximum: number): number;
  die(sides: number): number;
  state(): number;
}

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string | number): SeededRandom {
  let value = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  if (value === 0) value = 0x6d2b79f5;

  const next = (): number => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    integer(minimum: number, maximum: number) {
      if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) {
        throw new Error("SeededRandom.integer requires a valid inclusive integer range.");
      }
      return Math.floor(next() * (maximum - minimum + 1)) + minimum;
    },
    die(sides: number) {
      if (!Number.isInteger(sides) || sides < 2) throw new Error("A die needs at least two sides.");
      return Math.floor(next() * sides) + 1;
    },
    state: () => value >>> 0,
  };
}
