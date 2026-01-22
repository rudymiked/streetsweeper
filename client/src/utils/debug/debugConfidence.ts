import { Street } from "../../state/matching/matcher_kdtree";
import { DebugOverlayData } from "./debugOverlay.types";

export function computeStreetConfidence(data: DebugOverlayData): number {
  let score = 0;
  let max = 0;

  data.segments.forEach(seg => {
    score += seg.score;
    max += seg.maxScore;
  });

  return max === 0 ? 0 : score / max;
}

export function computeConfidencePerStreet(
  streets: Street[],
  debug: DebugOverlayData
) {
  const results = [];

  for (const street of streets) {
    // filter debug segments that belong to this street
    const segs = debug.segments.filter(seg =>
      seg.streetSeg.A1 === street.coords[0] ||
      seg.streetSeg.A2 === street.coords[street.coords.length - 1]
    );

    const confidence = computeStreetConfidence({ segments: segs });

    results.push({
      ...street,
      confidence
    });
  }

  return results;
}

export function classify(confidence: number) {
  if (confidence >= 0.75) return "definitely_run";
  if (confidence >= 0.45) return "probably_run";
  if (confidence >= 0.25) return "possibly_run";
  return "not_run";
}
