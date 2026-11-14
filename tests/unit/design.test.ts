import { describe, expect, it } from 'vitest';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { reviewDesign } from '../../src/simulation/review';
import { BASELINE_DESIGN, REFERENCE_DESIGN, cloneDesign, LAUNCH_VEHICLES, SITES } from '../../src/data/mission';
import { COMPONENT_BY_ID, componentsInSlot } from '../../src/data/components';
import { budgetForM } from '../../src/simulation/specModel';

const status = (d: any, id: string) => reviewDesign(d).checks.find((c) => c.id === id)?.status;

describe('mass & budget', () => {
  it('sums component masses into the launch mass', () => {
    const s = analyzeDesign(REFERENCE_DESIGN);
    const lineSum = s.mass.lines.reduce((a, l) => a + l.kg, 0);
    expect(s.mass.tliKg).toBeCloseTo(lineSum, 6);
    expect(s.mass.csmWetKg - s.mass.csmDryKg).toBeCloseTo(s.mass.smPropKg, 6);
  });
  it('adding a component increases mass and cost by exactly its values', () => {
    const a = analyzeDesign(REFERENCE_DESIGN);
    const d = cloneDesign(REFERENCE_DESIGN); d.science.push('sci_neutron');
    const b = analyzeDesign(d);
    expect(b.mass.tliKg - a.mass.tliKg).toBeCloseTo(COMPONENT_BY_ID.sci_neutron.massKg, 6);
    expect(b.costM - a.costM).toBe(COMPONENT_BY_ID.sci_neutron.costM);
  });
  it('flags over-budget designs as blocking', () => {
    const d = cloneDesign(REFERENCE_DESIGN);
    d.plan.lv = 'goldenbear'; d.slots.lander = 'lander_path'; d.slots.power = 'pwr_solar11'; d.slots.lifeSupport = 'ls_regen'; d.safety = ['saf_redund', 'saf_shelter'];
    d.spec = { ...d.spec, difficulty: 'hard' }; // spec: Hard budget $2.5B
    const r = reviewDesign(d);
    expect(r.stats.costM).toBeGreaterThan(budgetForM(d));
    expect(status(d, 'budget')).toBe('fail');
    expect(r.go).toBe(false);
  });
});

describe('design review', () => {
  it('reference design is GO', () => {
    const r = reviewDesign(REFERENCE_DESIGN);
    expect(r.blocking).toBe(0);
    expect(r.go).toBe(true);
  });
  it('baseline design needs work (rocket too small for the stack)', () => {
    // spec model: the capsule supplies the service-module fuel; the baseline's Bayhawk-M cannot
    // push the Apollo-style stack to 12,600 m/s
    const r = reviewDesign(BASELINE_DESIGN);
    expect(status(BASELINE_DESIGN, 'launch_mass')).toBe('fail');
    expect(r.go).toBe(false);
    expect(r.checks.find((c) => c.id === 'launch_mass')!.fix).toBeTruthy();
  });
  it('excessive mass fails the launch-mass check and names heavy components', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.plan.lv = 'bayhawk'; d.slots.tank = 'tank_l'; d.slots.lander = 'lander_path';
    const c = reviewDesign(d).checks.find((c) => c.id === 'launch_mass')!;
    expect(c.status).toBe('fail');
    expect(c.culprits.length).toBeGreaterThan(0);
    expect(c.fix).toBeTruthy();
  });
  it('insufficient electrical energy is blocking (fuel cell reactants run out)', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.slots.power = 'pwr_fuelcell'; d.slots.lifeSupport = 'ls_regen'; d.safety.push('saf_redund');
    d.plan.crew = 4; d.plan.stayDays = 3;
    expect(status(d, 'power')).toBe('fail');
  });
  it('a short fuel-cell mission has enough energy', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.slots.power = 'pwr_fuelcell';
    expect(status(d, 'power')).not.toBe('fail');
  });
  it('empty slot is reported as incomplete', () => {
    const d = cloneDesign(REFERENCE_DESIGN); delete d.slots.comms;
    const r = reviewDesign(d);
    expect(r.checks[0].id).toBe('complete');
    expect(r.go).toBe(false);
  });
  it('no science instruments is a warning, not blocking', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.science = [];
    expect(status(d, 'science')).toBe('warn');
  });
  it('slow comms + small recorder with a mapping camera warns about data loss', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.slots.comms = 'com_sband'; d.slots.storage = 'dat_128';
    expect(status(d, 'comms')).toBe('warn');
  });
  it('3 crew on a 2-seat lander: 2 land, 1 stays in orbit', () => {
    const s = analyzeDesign(REFERENCE_DESIGN);
    expect(s.landingCrew).toBe(2); expect(s.orbitCrew).toBe(1);
  });
  it('regenerative life support saves consumable mass but costs hardware mass', () => {
    const a = analyzeDesign(REFERENCE_DESIGN);
    const d = cloneDesign(REFERENCE_DESIGN); d.slots.lifeSupport = 'ls_regen';
    const b = analyzeDesign(d);
    expect(b.consumables.totalKg).toBeLessThan(a.consumables.totalKg);
    expect(b.mass.csmDryKg).toBeGreaterThan(a.mass.csmDryKg); // short mission: recycling does not pay off
  });
  it('multiple distinct configurations are feasible (no single perfect build)', () => {
    let go = 0; const lvs = new Set<string>();
    for (const lv of LAUNCH_VEHICLES) for (const eng of componentsInSlot('propulsion')) for (const tank of componentsInSlot('tank')) for (const site of SITES) {
      const d = cloneDesign(REFERENCE_DESIGN); d.plan.lv = lv.id; d.plan.site = site.id; d.slots.propulsion = eng.id; d.slots.tank = tank.id;
      if (reviewDesign(d).go) { go++; lvs.add(lv.id); }
    }
    expect(go).toBeGreaterThanOrEqual(4);
    expect(lvs.size).toBeGreaterThanOrEqual(2);
  });
  it('no dead options: every lander and launch vehicle appears in at least one GO design', () => {
    const lean = cloneDesign(REFERENCE_DESIGN);
    Object.assign(lean.slots, { lander: 'lander_path', battery: 'bat_12', comms: 'com_sband', storage: 'dat_128', guidance: 'gnc_std' });
    lean.science = ['sci_samples', 'sci_seismo']; lean.safety = []; lean.plan.lv = 'goldenbear';
    expect(reviewDesign(lean).go).toBe(true);
    const bay = cloneDesign(REFERENCE_DESIGN);
    Object.assign(bay.slots, { lander: 'lander_scout', comms: 'com_sband', storage: 'dat_128', guidance: 'gnc_std', battery: 'bat_12' });
    bay.science = ['sci_samples']; bay.safety = []; bay.plan.lv = 'bayhawk'; bay.spec = { ...bay.spec, landerPacks: 0 };
    expect(reviewDesign(bay).go).toBe(true);
    // Extended LM: the spec's G split leaves its ascent stage no room for rock (rover/drill science instead)
    const xlm = cloneDesign(REFERENCE_DESIGN); xlm.slots.lander = 'lander_xlm'; xlm.science = ['sci_mapcam', 'sci_seismo', 'sci_pancam'];
    expect(reviewDesign(xlm).go).toBe(true);
    const art = cloneDesign(REFERENCE_DESIGN); art.slots.lander = 'lander_hls'; art.plan.lv = 'goldenbear'; art.plan.crew = 4; delete art.slots.power;
    art.spec = { ...art.spec, architecture: 'artemis', orbit: 'NRHO', capsule: 'cap_orion' };
    expect(reviewDesign(art).go).toBe(true);
    expect(reviewDesign(REFERENCE_DESIGN).stats.parts.some((p) => p.id === 'lander_apollo')).toBe(true);
  });
});
