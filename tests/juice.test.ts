import { describe, expect, it } from "vitest";

import {
  MAX_PARTICLES,
  MAX_SHAKE_PX,
  addBurst,
  addConfetti,
  addPelletSpark,
  addPopup,
  addTrauma,
  createJuice,
  flashScreen,
  freezeFor,
  isFrozen,
  shakeOffset,
  stepJuice,
} from "@/lib/games/pacman/juice";

describe("juice", () => {
  it("starts quiet", () => {
    const juice = createJuice();
    expect(juice.particles).toHaveLength(0);
    expect(juice.popups).toHaveLength(0);
    expect(juice.trauma).toBe(0);
    expect(isFrozen(juice)).toBe(false);
    expect(shakeOffset(juice, 1000)).toEqual({ x: 0, y: 0 });
  });

  it("fades particles out and never keeps more than the cap", () => {
    const juice = createJuice();
    for (let index = 0; index < 60; index += 1) addBurst(juice, 5, 5, "#fff", 14);
    expect(juice.particles.length).toBeLessThanOrEqual(MAX_PARTICLES);

    stepJuice(juice, 700);
    expect(juice.particles).toHaveLength(0);
  });

  it("moves particles and lets the chunks fall", () => {
    const juice = createJuice();
    addBurst(juice, 5, 5, "#fff", 4);
    const before = juice.particles.map((particle) => ({ x: particle.x, vy: particle.vy }));
    stepJuice(juice, 100);
    juice.particles.forEach((particle, index) => {
      expect(particle.x).not.toBe(before[index].x);
      expect(particle.vy).toBeGreaterThan(before[index].vy); // gravity wins over drag
    });
  });

  it("raises popups as they die", () => {
    const juice = createJuice();
    addPopup(juice, 3, 4, "+200", "#fff");
    const startY = juice.popups[0].y;
    stepJuice(juice, 200);
    expect(juice.popups[0].y).toBeLessThan(startY);
    stepJuice(juice, 900);
    expect(juice.popups).toHaveLength(0);
  });

  it("shakes with trauma squared, and stops", () => {
    const juice = createJuice();
    const times = Array.from({ length: 60 }, (_, index) => index * 24);
    const strongest = (state: typeof juice) =>
      Math.max(...times.map((time) => Math.abs(shakeOffset(state, time).x)));

    addTrauma(juice, 0.5);
    const half = strongest(juice);
    expect(half).toBeLessThanOrEqual(MAX_SHAKE_PX * 0.25 + 1e-6);

    addTrauma(juice, 1); // clamps at 1
    expect(juice.trauma).toBe(1);
    const full = strongest(juice);
    expect(full).toBeGreaterThan(half);
    expect(full).toBeLessThanOrEqual(MAX_SHAKE_PX + 1e-6);

    stepJuice(juice, 1200);
    expect(juice.trauma).toBe(0);
    expect(shakeOffset(juice, 600)).toEqual({ x: 0, y: 0 });
  });

  it("freezes for hit-stop and counts back down", () => {
    const juice = createJuice();
    freezeFor(juice, 80);
    expect(isFrozen(juice)).toBe(true);
    stepJuice(juice, 40);
    expect(isFrozen(juice)).toBe(true);
    stepJuice(juice, 60);
    expect(isFrozen(juice)).toBe(false);
  });

  it("flashes for a fixed time and fades", () => {
    const juice = createJuice();
    flashScreen(juice, 200, "#ff0000");
    expect(juice.flashMs).toBe(200);
    stepJuice(juice, 120);
    expect(juice.flashMs).toBeCloseTo(80, 6);
    expect(juice.flashColor).toBe("#ff0000");
  });

  it("sparks a pellet and confettis a level, without limits on the caller", () => {
    const juice = createJuice();
    addPelletSpark(juice, 1, 2, "#fff");
    expect(juice.particles).toHaveLength(3);
    addConfetti(juice, 28, 31, ["#fff", "#000"], 40);
    expect(juice.particles.length).toBeGreaterThanOrEqual(43);
  });
});
