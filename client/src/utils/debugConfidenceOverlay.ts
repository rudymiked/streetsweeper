import L, { Map as LeafletMap, Layer } from "leaflet";
import { Street } from "../state/core/matcher_kdtree";

export function confidenceColor(conf: number): string {
  if (conf >= 0.75) return "#00c853";
  if (conf >= 0.45) return "#ffab00";
  if (conf >= 0.25) return "#ff5252";
  return "#9e9e9e";
}

export function ensureConfidencePane(map: LeafletMap) {
  if (!map.getPane("confidencePane")) {
    map.createPane("confidencePane");
    const pane = map.getPane("confidencePane")!;
    pane.style.zIndex = "650";
    pane.style.pointerEvents = "none";
  }
}

export function drawConfidenceOverlay(
  map: LeafletMap,
  streets: Array<Street & { confidence?: number }>
): void {
  ensureConfidencePane(map);

  const existing = (map as any)._confidenceLayers as Layer[] | undefined;
  if (existing) existing.forEach(l => map.removeLayer(l));
  (map as any)._confidenceLayers = [];

  const layers: Layer[] = [];

  streets.forEach(street => {
    const conf = street.confidence ?? 0;
    const color = confidenceColor(conf);

    const poly = L.polyline(
      street.coords.map(c => [c.latitude, c.longitude]),
      {
        color,
        weight: 6,
        opacity: 0.85,
        pane: "confidencePane"
      }
    );

    poly.bindTooltip(
      `Confidence: ${(conf * 100).toFixed(0)}%`,
      { sticky: true }
    );

    poly.addTo(map);
    layers.push(poly);
  });

  (map as any)._confidenceLayers = layers;
}

export function clearConfidenceOverlay(map: LeafletMap) {
  const existing = (map as any)._confidenceLayers as Layer[] | undefined;
  if (existing) existing.forEach(l => map.removeLayer(l));
  (map as any)._confidenceLayers = [];
}
