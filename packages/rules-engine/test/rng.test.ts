import { describe, expect, it } from "vitest";
import { createSeededRandom, hashSeed } from "../src/rng";

describe("seeded random source", () => {
  it("replays the same byte-for-byte sequence and final state for the same string seed", () => {
    const first = createSeededRandom("corinth-round-18");
    const second = createSeededRandom("corinth-round-18");

    const firstSequence = Array.from({ length: 32 }, () => first.die(6));
    const secondSequence = Array.from({ length: 32 }, () => second.die(6));

    expect(secondSequence).toEqual(firstSequence);
    expect(second.state()).toBe(first.state());
  });

  it("produces a different stream for a different seed", () => {
    const first = createSeededRandom("seed-alpha");
    const second = createSeededRandom("seed-beta");

    expect(Array.from({ length: 16 }, () => first.next())).not.toEqual(
      Array.from({ length: 16 }, () => second.next()),
    );
  });

  it("keeps integer and die results within inclusive bounds", () => {
    const random = createSeededRandom(0x12345678);

    const integers = Array.from({ length: 1_000 }, () => random.integer(-3, 7));
    const dice = Array.from({ length: 1_000 }, () => random.die(20));

    expect(Math.min(...integers)).toBeGreaterThanOrEqual(-3);
    expect(Math.max(...integers)).toBeLessThanOrEqual(7);
    expect(Math.min(...dice)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...dice)).toBeLessThanOrEqual(20);
  });

  it("normalizes numeric zero to a deterministic non-zero generator state", () => {
    const first = createSeededRandom(0);
    const second = createSeededRandom(0);

    expect(first.next()).toBe(second.next());
    expect(first.state()).not.toBe(0);
  });

  it("rejects invalid ranges and dice", () => {
    const random = createSeededRandom("invalid-inputs");

    expect(() => random.integer(3, 2)).toThrow(/valid inclusive integer range/i);
    expect(() => random.integer(0.5, 2)).toThrow(/valid inclusive integer range/i);
    expect(() => random.die(1)).toThrow(/at least two sides/i);
    expect(() => random.die(6.5)).toThrow(/at least two sides/i);
  });

  it("hashes equal seeds equally and distinguishes representative seed material", () => {
    expect(hashSeed("campaign:18:ruleset")).toBe(hashSeed("campaign:18:ruleset"));
    expect(hashSeed("campaign:18:ruleset")).not.toBe(hashSeed("campaign:19:ruleset"));
  });
});
