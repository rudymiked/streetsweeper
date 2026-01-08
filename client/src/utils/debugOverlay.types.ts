// debugOverlay.types.ts
import { Coord } from "../state/core/geometry/base";

export interface DebugEvidencePoint {
  lat: number;
  lon: number;
  type: "distance" | "intersection" | "bearing" | "strong" | "parallel_offset";
  value?: number; // distance, bearing diff, etc.
}

export interface DebugStreetSegment {
  A1: Coord;
  A2: Coord;
}

export interface DebugSegmentScore {
  streetSeg: DebugStreetSegment;
  score: number;
  maxScore: number;
  evidence: DebugEvidencePoint[];
}

export interface DebugOverlayData {
  segments: DebugSegmentScore[];
}
