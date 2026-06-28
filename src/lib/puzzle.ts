export type Marker = {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lng: number;
  /** Year shown above the marker */
  year: number;
  /** Human-readable place name (for tooltips / accessibility) */
  place: string;
};

export type Puzzle = {
  /** Stable identifier for the puzzle */
  id: string;
  /** The answer (kept client-side only during Phase 0 spike) */
  answer: string;
  birth: Marker;
  death: Marker;
};

/**
 * Phase 0 hardcoded puzzle used to validate the map UX.
 * Charlie Kirk: born Arlington Heights, IL 1993, died Orem, UT 2025.
 */
export const SAMPLE_PUZZLE: Puzzle = {
  id: "sample-charlie-kirk",
  answer: "Charlie Kirk",
  birth: { lat: 42.0884, lng: -87.9806, year: 1993, place: "Arlington Heights, Illinois" },
  death: { lat: 40.2969, lng: -111.6946, year: 2025, place: "Orem, Utah" },
};
