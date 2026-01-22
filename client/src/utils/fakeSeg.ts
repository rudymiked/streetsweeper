import { DebugStreetSegment } from "./debug/debugOverlay.types";

export function fakeSeg(): DebugStreetSegment {
  return {
    A1: { latitude: 0, longitude: 0 },
    A2: { latitude: 0, longitude: 0 }
  };
}
