/**
 * Spacecraft component catalogue. Values are simplified, rounded, and partly INVENTED for gameplay
 * balance; magnitudes are informed by Apollo/Orion-class hardware (see docs/SCIENTIFIC_ASSUMPTIONS.md).
 * Units: mass kg, cost $M, power W (positive = consumption, generation in `genW`), energy Wh.
 */
export type SlotId =
  | 'propulsion' | 'tank' | 'lander' | 'power' | 'battery' | 'comms' | 'storage'
  | 'lifeSupport' | 'thermal' | 'heatShield' | 'guidance' | 'safety' | 'science';

export interface Component {
  id: string;
  slot: SlotId;
  name: string;
  short: string; // compact label for cards
  desc: string;
  learn: string; // educational note
  massKg: number;
  costM: number;
  powerW?: number; // continuous electrical load when operating
  reliability?: number; // probability of no critical failure over the mission (simplified)
  sprite: string; // texture key for the visual part
  // capability metrics (only the relevant ones are set)
  ispS?: number;
  thrustN?: number;
  propCapacityKg?: number;
  genW?: number; // electrical generation (W) at 1 AU, beginning of life
  genKind?: 'solar' | 'fuelcell';
  fuelCellReactantWh?: number;
  storageWh?: number;
  downlinkMbps?: number;
  linkAvailability?: number; // fraction of time ground link usable (weather etc.)
  backupMbps?: number;
  storageMB?: number;
  waterRecovery?: number; // fraction of water recycled
  o2Recovery?: number;
  heatRejectW?: number;
  heatShieldMargin?: number; // tolerance factor vs nominal entry heat load
  hazardDetection?: boolean;
  landingPrecisionM?: number;
  // lander specific
  crewCapacity?: number;
  descentDryKg?: number; descentPropKg?: number; ascentDryKg?: number; ascentPropKg?: number;
  landerBatteryWh?: number; landerLoadW?: number; stayRatedH?: number; sampleCapacityKg?: number;
  onLander?: boolean; // mass carried by lander rather than CSM
  dataMbps?: number; // science data rate while active
  scienceTag?: string;
}

export const COMPONENTS: Component[] = [
  // ---------------------------------------------------------------- propulsion
  {
    id: 'eng_hyper', slot: 'propulsion', name: 'Hypergolic Main Engine', short: 'Hypergolic', sprite: 'eng_hyper',
    desc: 'Storable propellants that ignite on contact. Simple, proven, restartable.',
    learn: 'Hypergolic engines (like the Apollo service engine) trade efficiency for reliability: no igniter, no cryogenic boil-off, Isp ~316 s.',
    massKg: 300, costM: 90, ispS: 316, thrustN: 27000, reliability: 0.998,
  },
  {
    id: 'eng_methalox', slot: 'propulsion', name: 'Methalox Main Engine', short: 'Methalox', sprite: 'eng_methalox',
    desc: 'Liquid methane + oxygen. Higher Isp, but cryogenic tanks need active cooling.',
    learn: 'Higher specific impulse (360 s) means more Δv per kg of propellant (rocket equation), but cryocoolers draw power and the engine has less flight heritage.',
    massKg: 520, costM: 210, powerW: 150, ispS: 360, thrustN: 30000, reliability: 0.99,
  },
  // ---------------------------------------------------------------- tanks
  { id: 'tank_s', slot: 'tank', name: 'Compact Propellant Tanks', short: '13 t tanks', sprite: 'sm_s', desc: 'Holds 13,000 kg of propellant.', learn: 'Every kg of tank and propellant must itself be accelerated: bigger tanks give diminishing returns.', massKg: 950, costM: 60, propCapacityKg: 13000 },
  { id: 'tank_m', slot: 'tank', name: 'Standard Propellant Tanks', short: '16.5 t tanks', sprite: 'sm_m', desc: 'Holds 16,500 kg of propellant.', learn: 'Tank structure is roughly 7-8% of the propellant mass it holds in this model.', massKg: 1250, costM: 85, propCapacityKg: 16500 },
  { id: 'tank_l', slot: 'tank', name: 'Extended Propellant Tanks', short: '20 t tanks', sprite: 'sm_l', desc: 'Holds 20,000 kg of propellant.', learn: 'More propellant raises Δv, but also raises launch mass, which may exceed your rocket.', massKg: 1500, costM: 110, propCapacityKg: 20000 },
  // ---------------------------------------------------------------- landers
  {
    id: 'lander_scout', slot: 'lander', name: 'Scout Lander', short: 'Scout (2 crew)', sprite: 'lander_scout',
    desc: 'Two-stage lander for 2 crew, ~3 day rated stay, 40 kg sample return.',
    learn: 'A two-stage lander leaves its heavy descent stage on the Moon, so the ascent engine only lifts the cabin, crew and samples.',
    massKg: 0, costM: 1150, crewCapacity: 2, descentDryKg: 1900, descentPropKg: 7400, ascentDryKg: 1900, ascentPropKg: 2200,
    ispS: 311, thrustN: 45000, landerBatteryWh: 90000, landerLoadW: 1100, stayRatedH: 80, sampleCapacityKg: 40, reliability: 0.99,
  },
  {
    id: 'lander_path', slot: 'lander', name: 'Pathfinder Lander', short: 'Pathfinder (3)', sprite: 'lander_path',
    desc: 'Larger lander for 3 crew, ~6 day rated stay, 90 kg sample return.',
    learn: 'More crew on the surface means more EVA hours (more science), but every kg costs propellant during descent AND on the outbound trip.',
    massKg: 0, costM: 1450, crewCapacity: 3, descentDryKg: 2900, descentPropKg: 11200, ascentDryKg: 2600, ascentPropKg: 3050,
    ispS: 316, thrustN: 60000, landerBatteryWh: 160000, landerLoadW: 1400, stayRatedH: 150, sampleCapacityKg: 90, reliability: 0.985,
  },
  // ---------------------------------------------------------------- power
  { id: 'pwr_solar6', slot: 'power', name: 'Rigid Solar Wings', short: 'Solar 6 kW', sprite: 'pwr_solar4', desc: 'Two rigid wings, 6.0 kW in full sunlight.', learn: 'Solar arrays produce nothing in shadow. In low lunar orbit ~40% of every orbit is dark, so ORBIT-AVERAGE power is what matters.', massKg: 380, costM: 70, genW: 6000, genKind: 'solar', reliability: 0.995 },
  { id: 'pwr_solar11', slot: 'power', name: 'High-Efficiency Solar Wings', short: 'Solar 11 kW', sprite: 'pwr_solar8', desc: 'Multi-junction cells, 11 kW in full sunlight.', learn: 'Higher-efficiency cells give more watts per kg and per square metre, at higher cost.', massKg: 450, costM: 160, genW: 11000, genKind: 'solar', reliability: 0.995 },
  { id: 'pwr_fuelcell', slot: 'power', name: 'Fuel Cell Stack', short: 'Fuel cells', sprite: 'pwr_fuelcell', desc: '3.6 kW day or night from H2/O2 reactants; makes drinking water.', learn: 'Apollo used fuel cells: they work in darkness and produce water, but run out when reactants are consumed (~0.35 kg per kWh).', massKg: 760, costM: 140, genW: 3600, genKind: 'fuelcell', fuelCellReactantWh: 800000, reliability: 0.99 },
  // ---------------------------------------------------------------- batteries
  { id: 'bat_12', slot: 'battery', name: 'Li-ion Battery 12 kWh', short: '12 kWh', sprite: 'battery', desc: 'Covers eclipses; ~5 h of safe-mode loads.', learn: 'E_next = clamp(E + (P_gen − P_load)·Δt, 0, E_max). Batteries bridge gaps when generation drops.', massKg: 90, costM: 15, storageWh: 12000 },
  { id: 'bat_24', slot: 'battery', name: 'Li-ion Battery 24 kWh', short: '24 kWh', sprite: 'battery', desc: 'Comfortable reserve for faults and eclipses.', learn: 'Li-ion packs store roughly 130-150 Wh per kg at the pack level.', massKg: 170, costM: 28, storageWh: 24000 },
  { id: 'bat_40', slot: 'battery', name: 'Li-ion Battery 40 kWh', short: '40 kWh', sprite: 'battery', desc: 'Large reserve: a full day of safe-mode power.', learn: 'A big battery buys TIME to respond when something goes wrong.', massKg: 280, costM: 45, storageWh: 40000 },
  // ---------------------------------------------------------------- comms
  { id: 'com_sband', slot: 'comms', name: 'S-Band Omni Antennas', short: 'S-band 0.5', sprite: 'com_sband', desc: '0.5 Mbps from lunar distance. Light and simple.', learn: 'Low-gain antennas radiate in all directions; at 384,000 km that limits the data rate.', massKg: 35, costM: 20, powerW: 80, downlinkMbps: 0.5, linkAvailability: 1, reliability: 0.999 },
  { id: 'com_hga', slot: 'comms', name: 'Steerable High-Gain Antenna', short: 'HGA 6 Mbps', sprite: 'com_hga', desc: '6 Mbps; must be pointed at Earth.', learn: 'Focusing energy into a narrow beam increases the data rate but requires accurate pointing.', massKg: 85, costM: 55, powerW: 160, downlinkMbps: 6, linkAvailability: 1, reliability: 0.995 },
  { id: 'com_laser', slot: 'comms', name: 'Optical Laser Terminal', short: 'Laser 100', sprite: 'com_laser', desc: '100 Mbps, but clouds over the ground station block it (~65% available). S-band backup.', learn: 'Optical links carry far more data, but the beam cannot pass through clouds: link availability is a real design driver.', massKg: 70, costM: 120, powerW: 140, downlinkMbps: 100, linkAvailability: 0.65, backupMbps: 0.5, reliability: 0.99 },
  // ---------------------------------------------------------------- storage
  { id: 'dat_128', slot: 'storage', name: 'Data Recorder 128 GB', short: '128 GB', sprite: 'dat_s', desc: 'Basic solid-state recorder.', learn: 'Stored = clamp(Stored + Generated − Downlinked, 0, Capacity). A full recorder means new data is LOST.', massKg: 8, costM: 8, powerW: 15, storageMB: 128000 },
  { id: 'dat_1t', slot: 'storage', name: 'Rad-Hard Recorder 1 TB', short: '1 TB', sprite: 'dat_l', desc: 'Large radiation-tolerant storage.', learn: 'More storage lets you collect now and transmit (or bring home) later.', massKg: 14, costM: 30, powerW: 30, storageMB: 1000000 },
  // ---------------------------------------------------------------- life support
  { id: 'ls_open', slot: 'lifeSupport', name: 'Open-Loop Stores', short: 'Open-loop', sprite: 'ls_open', desc: 'Carry all water and oxygen; nothing recycled.', learn: 'For short missions, carrying consumables is lighter than recycling hardware.', massKg: 150, costM: 40, powerW: 150, waterRecovery: 0, o2Recovery: 0, reliability: 0.998 },
  { id: 'ls_regen', slot: 'lifeSupport', name: 'Regenerative ECLSS', short: 'Regenerative', sprite: 'ls_regen', desc: 'Recycles 85% of water and 40% of oxygen. Heavy and power-hungry.', learn: 'Recycling pays off on long missions; the ISS recovers ~90% of its water. It needs power and can fail.', massKg: 520, costM: 160, powerW: 650, waterRecovery: 0.85, o2Recovery: 0.4, reliability: 0.985 },
  // ---------------------------------------------------------------- thermal
  { id: 'thr_std', slot: 'thermal', name: 'Body-Mounted Radiators', short: 'Rad 4.0 kW', sprite: 'thr_std', desc: 'Rejects up to 4.0 kW of heat.', learn: 'Every watt of electrical power ends up as heat that must be radiated to space, plus ~100 W per crew member.', massKg: 180, costM: 30, heatRejectW: 4000 },
  { id: 'thr_ext', slot: 'thermal', name: 'Deployable Radiators', short: 'Rad 7.0 kW', sprite: 'thr_ext', desc: 'Rejects up to 7.0 kW of heat.', learn: 'Deployable radiator panels add area (and mass) to reject more heat.', massKg: 300, costM: 70, heatRejectW: 7000 },
  // ---------------------------------------------------------------- heat shield
  { id: 'hs_std', slot: 'heatShield', name: 'Ablative Heat Shield', short: 'Ablative', sprite: 'hs_std', desc: 'Rated 1.3x the nominal lunar-return heat load.', learn: 'Returning from the Moon at ~11 km/s, the shield ablates (chars away) to carry heat off.', massKg: 600, costM: 60, heatShieldMargin: 1.3, reliability: 0.999 },
  { id: 'hs_thick', slot: 'heatShield', name: 'Thick Ablative Shield', short: 'Thick shield', sprite: 'hs_thick', desc: 'Rated 1.7x nominal heat load; tolerates steeper entries.', learn: 'Extra margin protects the crew if the entry angle is off-nominal.', massKg: 850, costM: 85, heatShieldMargin: 1.7, reliability: 0.9995 },
  // ---------------------------------------------------------------- guidance
  { id: 'gnc_std', slot: 'guidance', name: 'Star Tracker + IMU', short: 'Standard GNC', sprite: 'gnc_std', desc: 'Navigation by stars and inertial sensors. ~1 km landing precision.', learn: 'Without terrain sensing, the landing site can only be predicted to within a large ellipse.', massKg: 40, costM: 25, powerW: 90, landingPrecisionM: 1000, hazardDetection: false },
  { id: 'gnc_trn', slot: 'guidance', name: 'Terrain-Relative Nav + Lidar', short: 'TRN + Lidar', sprite: 'gnc_trn', desc: 'Maps hazards during descent and steers to a safe spot.', learn: 'Terrain-relative navigation compares camera images with maps; hazard lidar finds boulders and slopes in real time.', massKg: 85, costM: 95, powerW: 180, landingPrecisionM: 100, hazardDetection: true, onLander: true },
  // ---------------------------------------------------------------- safety (multi)
  { id: 'saf_redund', slot: 'safety', name: 'Redundant Avionics', short: 'Redundancy', sprite: 'saf_redund', desc: 'Backup flight computers that take over automatically.', learn: 'Redundancy raises reliability: two independent 99% units fail together only 0.01% of the time.', massKg: 60, costM: 50, powerW: 120, reliability: 1.0 },
  { id: 'saf_shelter', slot: 'safety', name: 'Radiation Storm Shelter', short: 'Storm shelter', sprite: 'saf_shelter', desc: 'Water-wall shelter for solar particle events.', learn: 'Mass between crew and space (water, stowage) shields from solar particle radiation.', massKg: 180, costM: 25 },
  // ---------------------------------------------------------------- science (multi)
  { id: 'sci_mapcam', slot: 'science', name: 'Orbital Mapping Camera', short: 'Mapping cam', sprite: 'sci_mapcam', desc: 'High-res imaging from orbit. 40 Mbps while imaging in sunlight.', learn: 'Imaging needs sunlight and makes huge data volumes: storage and downlink must keep up.', massKg: 45, costM: 60, powerW: 120, dataMbps: 40, scienceTag: 'map' },
  { id: 'sci_neutron', slot: 'science', name: 'Neutron Spectrometer', short: 'Neutron spec', sprite: 'sci_neutron', desc: 'Detects hydrogen (water ice) from orbit. Low data rate.', learn: 'Cosmic rays knock neutrons out of the surface; hydrogen absorbs them, revealing buried ice.', massKg: 25, costM: 35, powerW: 30, dataMbps: 0.05, scienceTag: 'neutron' },
  { id: 'sci_seismo', slot: 'science', name: 'Seismometer Package', short: 'Seismometer', sprite: 'sci_seismo', desc: 'Deployed on the surface; listens for moonquakes for years.', learn: 'Apollo seismometers revealed the Moon’s layered interior and shallow moonquakes.', massKg: 70, costM: 45, onLander: true, scienceTag: 'seismo' },
  { id: 'sci_samples', slot: 'science', name: 'Geology Sample Kit', short: 'Sample kit', sprite: 'sci_samples', desc: 'Tools and sealed containers to return rocks and regolith.', learn: 'Returned samples can be studied with lab instruments far beyond anything we can fly.', massKg: 35, costM: 20, onLander: true, scienceTag: 'samples' },
  { id: 'sci_pancam', slot: 'science', name: 'Panoramic Surface Camera', short: 'Pan camera', sprite: 'sci_pancam', desc: 'Stereo panoramas of the landing site and geology context.', learn: 'Context imaging tells scientists where each sample came from.', massKg: 18, costM: 25, powerW: 25, onLander: true, scienceTag: 'pancam' },
  { id: 'sci_retro', slot: 'science', name: 'Laser Retroreflector', short: 'Retroreflector', sprite: 'sci_retro', desc: 'Passive mirror array for laser ranging from Earth.', learn: 'Apollo retroreflectors are still used to measure the Earth–Moon distance to millimetres.', massKg: 25, costM: 10, onLander: true, scienceTag: 'retro' },
];

export const SLOTS: { id: SlotId; label: string; icon: string; multi?: boolean; help: string }[] = [
  { id: 'propulsion', label: 'Propulsion', icon: 'engine', help: 'Main engine of the service module: performs lunar orbit insertion and trans-Earth injection.' },
  { id: 'tank', label: 'Fuel Capacity', icon: 'fuel', help: 'Propellant carried by the service module. Sets how much Δv you have.' },
  { id: 'lander', label: 'Lunar Lander', icon: 'moon', help: 'Takes crew from lunar orbit to the surface and back up.' },
  { id: 'power', label: 'Power', icon: 'power', help: 'Electrical generation for the crew vehicle.' },
  { id: 'battery', label: 'Batteries', icon: 'battery', help: 'Energy storage for eclipses and emergencies.' },
  { id: 'comms', label: 'Communications', icon: 'comms', help: 'Link to mission control and science downlink.' },
  { id: 'storage', label: 'Data Storage', icon: 'data', help: 'Onboard recorder for science data.' },
  { id: 'lifeSupport', label: 'Life Support', icon: 'o2', help: 'Oxygen, water and air revitalisation for the crew.' },
  { id: 'thermal', label: 'Thermal', icon: 'thermal', help: 'Radiators that dump waste heat to space.' },
  { id: 'heatShield', label: 'Heat Shield', icon: 'safety', help: 'Protects the capsule during Earth re-entry.' },
  { id: 'guidance', label: 'Guidance', icon: 'guidance', help: 'Navigation and landing sensors.' },
  { id: 'safety', label: 'Mission Safety', icon: 'radiation', multi: true, help: 'Optional safety systems (choose any).' },
  { id: 'science', label: 'Science', icon: 'science', multi: true, help: 'Instruments (choose any). Science drives 30% of your score.' },
];

export const COMPONENT_BY_ID: Record<string, Component> = Object.fromEntries(COMPONENTS.map((c) => [c.id, c]));
export function componentsInSlot(slot: SlotId): Component[] {
  return COMPONENTS.filter((c) => c.slot === slot);
}
