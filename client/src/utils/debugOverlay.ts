// debug/overlay.ts

import L, { Map as LeafletMap, Layer } from "leaflet";
import {
  DebugOverlayData,
  DebugSegmentScore,
  DebugEvidencePoint
} from "./debugOverlay.types";

export function drawDebugOverlay(
  map: LeafletMap,
  data: DebugOverlayData
): void {
  // Remove old layers
  const existing = (map as any)._debugLayers as Layer[] | undefined;
  if (existing) {
    existing.forEach(l => map.removeLayer(l));
  }
  (map as any)._debugLayers = [];

  const layers: Layer[] = [];

  data.segments.forEach((seg: DebugSegmentScore) => {
    const ratio = seg.score / seg.maxScore;

    const color =
      ratio > 0.7 ? "green" :
      ratio > 0.4 ? "orange" :
      "red";

    // Draw street segment
    const segLine = L.polyline(
      [
        [seg.streetSeg.A1.latitude, seg.streetSeg.A1.longitude],
        [seg.streetSeg.A2.latitude, seg.streetSeg.A2.longitude]
      ],
      { color, weight: 6, opacity: 0.8 }
    );

    segLine.addTo(map);
    layers.push(segLine);

    // Draw evidence points
    seg.evidence.forEach(pt => {
      const marker = L.circleMarker([pt.lat, pt.lon], {
        radius: 4,
        color: evidenceColor(pt.type),
        fillOpacity: 0.7
      });

      marker.addTo(map);
      layers.push(marker);
    });
  });

  (map as any)._debugLayers = layers;
}

function evidenceColor(type: DebugEvidencePoint["type"]): string {
  switch (type) {
    case "distance": return "blue";
    case "intersection": return "yellow";
    case "bearing": return "purple";
    case "strong": return "cyan";
    default: return "gray";
  }
}
