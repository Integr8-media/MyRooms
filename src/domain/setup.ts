import type { Piasters } from './money';
import type { StationKind } from './validation';

/**
 * Quick setup for a new organization (Phase 10): from "4 PS rooms at 60 EGP/h and
 * 10 PCs at 20 EGP/h" to station types, a base hourly price each, and numbered stations.
 * Owners refine it later in Settings (peak hours, player-count prices, packages).
 */

/** Every day of the week (bit 0 = Sunday), as the rate rule form uses. */
export const ALL_DAYS = 0b1111111;

export type StarterGroup = {
  kind: StationKind;
  /** Station type name, e.g. "PlayStation room". */
  typeName: string;
  /** Stations are numbered after it: "Room 1", "Room 2"… */
  stationPrefix: string;
  count: number;
  pricePerHour: Piasters;
  maxPlayers: number;
  color: string;
};

export type StarterType = {
  kind: StationKind;
  name: string;
  color: string;
  maxPlayers: number;
  pricePerHour: Piasters;
  stationNames: string[];
};

/** Groups with at least one station become a type with its stations (in the given order). */
export function starterTypes(groups: readonly StarterGroup[]): StarterType[] {
  return groups
    .filter((g) => g.count > 0)
    .map((g) => ({
      kind: g.kind,
      name: g.typeName,
      color: g.color,
      maxPlayers: g.maxPlayers,
      pricePerHour: g.pricePerHour,
      stationNames: Array.from({ length: g.count }, (_, i) => `${g.stationPrefix} ${i + 1}`),
    }));
}

export type SetupStep = 'prices' | 'stations' | 'staff';
export const SETUP_STEPS: readonly SetupStep[] = ['prices', 'stations', 'staff'];

export type SetupFacts = {
  /** Active station types that have at least one rate rule. */
  pricedTypes: number;
  /** Active stations in the organization. */
  stations: number;
  /** Other members plus open invitations. */
  staff: number;
};

export function setupProgress(facts: SetupFacts): {
  done: Record<SetupStep, boolean>;
  remaining: number;
} {
  const done: Record<SetupStep, boolean> = {
    prices: facts.pricedTypes > 0,
    stations: facts.stations > 0,
    staff: facts.staff > 0,
  };
  return { done, remaining: SETUP_STEPS.filter((s) => !done[s]).length };
}
