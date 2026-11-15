/** C1: the Rocket tab's engine -> fuel lock, setters, presets and live readout. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, LAUNCH_VEHICLES, REFERENCE_DESIGN } from '../../src/data/mission';
import { ROCKET_PRESETS } from '../../src/data/specParts';
import { canPair, fuelChoices, presetBuild, rocketReadout, setBoosters, setCount, setEngine, setFuel, stageRisks, FUEL_RANGE } from '../../src/simulation/rocketEditor';
import { maxPayloadKg, stageStats } from '../../src/simulation/stack';

describe('Rocket tab: fuel locks to the engine', () => {
  it('RS-25 cannot be paired with kerosene; its fuel menu greys the others with a reason', () => {
    expect(canPair('rs25', 'kerolox')).toBe(false);
    expect(canPair('rs25', 'hydrolox')).toBe(true);
    const menu = fuelChoices('rs25');
    expect(menu.filter((f) => f.allowed).map((f) => f.fuel)).toEqual(['hydrolox']);
    expect(menu.find((f) => f.fuel === 'kerolox')!.reason).toBe('RS-25 only burns hydrogen + LOX.');
  });
  it('switching Merlin 1D -> RS-25 switches the stage to hydrogen and says so in one line', () => {
    const b = { ...presetBuild('estuary'), stage1: { engine: 'merlin1d', count: 9, fuelLb: 3_000_000, material: 'alli' as const } };
    expect(stageStats(b.stage1).fuel).toBe('kerolox');
    const r = setEngine(b, 1, 'rs25');
    expect(stageStats(r.build.stage1).fuel).toBe('hydrolox');
    expect(r.note).toBe('Stage 1 now burns hydrogen + LOX: the RS-25 only burns that.');
    expect(setEngine(r.build, 1, 'rs25').note).toBeNull(); // same fuel: no note
    expect(r.build.name).toMatch(/^Custom/);
  });
  it('the presets reproduce their current capacities', () => {
    for (const lv of LAUNCH_VEHICLES) {
      const b = presetBuild(lv.id);
      expect(b).toEqual(ROCKET_PRESETS[lv.id]);
      expect(Math.abs(maxPayloadKg(b) - lv.tliCapacityKg) / lv.tliCapacityKg).toBeLessThan(0.01);
    }
  });
  it('setters clamp to sensible ranges and the readout follows the build', () => {
    const b = presetBuild('estuary');
    expect(setCount(b, 2, 99).stage2.count).toBe(6);
    expect(setCount(b, 2, 0).stage2.count).toBe(1);
    expect(setFuel(b, 2, 10).stage2.fuelLb).toBe(FUEL_RANGE[2].min);
    expect(setBoosters(b, null, 2).boosterCount).toBe(0);
    expect(setBoosters(b, 'gem63xl', 9).boosterCount).toBe(6);
    const d = cloneDesign(REFERENCE_DESIGN);
    const before = rocketReadout(d);
    d.spec = { ...d.spec!, rocket: setCount(presetBuild('estuary'), 2, 6) };
    const after = rocketReadout(d);
    expect(after.upper).toBeGreaterThan(before.upper); // more stage 2 engines = more upper-stage push
  });
  it('a carbon-fiber hydrogen stage shows the High risk with the metal-liner fix', () => {
    const b = { ...presetBuild('estuary'), stage2: { engine: 'rl10', count: 4, fuelLb: 700_000, material: 'carbon' as const } };
    const r = stageRisks(b, 2, []);
    expect(r.find((x) => x.id === 'carbon_h2')!.now).toBe('High');
    expect(stageRisks(b, 2, ['liner']).find((x) => x.id === 'carbon_h2')!.now).toBe('Medium');
  });
});
