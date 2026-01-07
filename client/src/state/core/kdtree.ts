// state/core/kdtree.ts
export type KDPoint = {
  x: number;
  y: number;
  segIndex: number;
  activityIndex: number;
};

export type KDNode = {
  point: KDPoint;
  left: KDNode | null;
  right: KDNode | null;
  axis: number;
};

export function buildKDTree(points: KDPoint[], depth = 0): KDNode | null {
  if (points.length === 0) return null;

  const axis = depth % 2;
  const sorted = points.slice().sort((a, b) =>
    axis === 0 ? a.x - b.x : a.y - b.y
  );

  const median = Math.floor(sorted.length / 2);

  return {
    point: sorted[median],
    left: buildKDTree(sorted.slice(0, median), depth + 1),
    right: buildKDTree(sorted.slice(median + 1), depth + 1),
    axis
  };
}

export function kdRangeSearch(
  node: KDNode | null,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  results: KDPoint[] = []
): KDPoint[] {
  if (!node) return results;

  const { point, axis } = node;

  if (
    point.x >= xMin &&
    point.x <= xMax &&
    point.y >= yMin &&
    point.y <= yMax
  ) {
    results.push(point);
  }

  if (axis === 0) {
    if (xMin <= point.x) kdRangeSearch(node.left, xMin, xMax, yMin, yMax, results);
    if (xMax >= point.x) kdRangeSearch(node.right, xMin, xMax, yMin, yMax, results);
  } else {
    if (yMin <= point.y) kdRangeSearch(node.left, xMin, xMax, yMin, yMax, results);
    if (yMax >= point.y) kdRangeSearch(node.right, xMin, xMax, yMin, yMax, results);
  }

  return results;
}
