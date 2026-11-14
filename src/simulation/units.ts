/**
 * Unit boundary. The simulation works in SI (kg, N, m/s, W, Wh). Spec data is in lb; the player
 * sees lb, N, m/s, USD, miles and mph. Convert only here, never inside a formula.
 */
export const KG_PER_LB = 0.45359237;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

/** Whole number with thousands separators: 12600 -> "12,600". */
export function fmt(v: number, digits = 0): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export const fmtLb = (kg: number) => `${fmt(kgToLb(kg))} lb`;
export const fmtN = (n: number) => `${fmt(n)} N`;
export const fmtMs = (v: number) => `${fmt(v)} m/s`;
export const fmtUsd = (usd: number) => `$${fmt(usd)}`;
/** Money stored in $M internally (existing convention) shown as full USD. */
export const fmtUsdM = (m: number) => fmtUsd(Math.round(m * 1_000_000));
