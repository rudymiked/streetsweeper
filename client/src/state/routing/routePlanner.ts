// routePlanner.ts
// Route planning algorithm to maximize unrun street coverage

import { Coord, degToMeters, metersToDeg } from '../core/geometry/base';
import { Street } from '../matching/matcher_kdtree';

// Constants
const METERS_PER_MILE = 1609.34;
const EARTH_RADIUS_METERS = 6378137;

// Types
export interface RoutePoint {
  coord: Coord;
  streetId: string | null;
  nodeId: string;
}

export interface RouteSegment {
  from: RoutePoint;
  to: RoutePoint;
  distance: number; // meters
  streetId: string;
  streetName: string;
  isUnrun: boolean;
}

export interface PlannedRoute {
  segments: RouteSegment[];
  totalDistance: number; // meters
  unrunDistance: number; // meters
  unrunPercentage: number;
  path: Coord[];
}

export interface RoutePlannerOptions {
  startPoint: Coord;
  endPoint: Coord;
  targetDistanceMiles: number;
  streets: Street[];
  preferUnrun: boolean; // Weight factor for preferring unrun streets
}

// Graph node for pathfinding
interface GraphNode {
  id: string;
  coord: Coord;
  edges: GraphEdge[];
}

interface GraphEdge {
  toNodeId: string;
  distance: number;
  streetId: string;
  streetName: string;
  isUnrun: boolean;
  coords: Coord[]; // Full coordinates for this edge
}

// Priority queue for A*
class PriorityQueue<T> {
  private items: { item: T; priority: number }[] = [];

  enqueue(item: T, priority: number): void {
    this.items.push({ item, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): T | undefined {
    return this.items.shift()?.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

// ---------------------------------------------------------
// Distance calculation helpers
// ---------------------------------------------------------
export function haversineDistance(a: Coord, b: Coord): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function polylineDistance(coords: Coord[]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistance(coords[i], coords[i + 1]);
  }
  return total;
}

// ---------------------------------------------------------
// Graph construction from streets
// ---------------------------------------------------------
function coordKey(c: Coord, precision = 5): string {
  // Use 5 decimal places (~1.1m precision) to catch nearby intersections
  return `${c.latitude.toFixed(precision)},${c.longitude.toFixed(precision)}`;
}

function buildStreetGraph(streets: Street[]): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();
  
  // Use a grid to merge nearby endpoints (within ~20m)
  const gridSize = 0.0002; // ~20m at mid latitudes
  const grid = new Map<string, { coord: Coord; key: string }>();
  
  function getGridKey(c: Coord): string {
    return `${Math.floor(c.latitude / gridSize)},${Math.floor(c.longitude / gridSize)}`;
  }
  
  function findOrCreateNode(c: Coord): string {
    const gk = getGridKey(c);
    
    // Check this cell and neighbors for existing node
    const [gLat, gLon] = gk.split(',').map(Number);
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        const neighborKey = `${gLat + dLat},${gLon + dLon}`;
        const existing = grid.get(neighborKey);
        if (existing && haversineDistance(c, existing.coord) < 25) {
          return existing.key;
        }
      }
    }
    
    // No nearby node found, create new one
    const nodeKey = coordKey(c);
    grid.set(gk, { coord: c, key: nodeKey });
    nodes.set(nodeKey, { id: nodeKey, coord: c, edges: [] });
    return nodeKey;
  }
  
  // Create nodes and edges
  for (const street of streets) {
    if (street.coords.length < 2) continue;
    
    const startKey = findOrCreateNode(street.coords[0]);
    const endKey = findOrCreateNode(street.coords[street.coords.length - 1]);
    
    if (startKey === endKey) continue; // Skip loops
    
    const distance = polylineDistance(street.coords);
    const edgeId = street.id;
    
    const startNode = nodes.get(startKey)!;
    const endNode = nodes.get(endKey)!;
    
    // Check if edge already exists
    if (!startNode.edges.some(e => e.toNodeId === endKey && e.streetId === edgeId)) {
      startNode.edges.push({
        toNodeId: endKey,
        distance,
        streetId: edgeId,
        streetName: street.name || 'Unnamed Street',
        isUnrun: !street.completed,
        coords: street.coords
      });
      
      endNode.edges.push({
        toNodeId: startKey,
        distance,
        streetId: edgeId,
        streetName: street.name || 'Unnamed Street',
        isUnrun: !street.completed,
        coords: [...street.coords].reverse()
      });
    }
  }
  
  // Log connectivity stats
  const edgeCounts = [...nodes.values()].map(n => n.edges.length);
  const avgEdges = edgeCounts.reduce((a, b) => a + b, 0) / nodes.size;
  const nodesWithMultiple = edgeCounts.filter(c => c > 1).length;
  console.log(`Built graph: ${nodes.size} nodes, avg ${avgEdges.toFixed(1)} edges/node, ${nodesWithMultiple} intersections`);
  
  return nodes;
}

// ---------------------------------------------------------
// Find nearest node in graph to a given coordinate
// ---------------------------------------------------------
function findNearestNode(
  coord: Coord,
  nodes: Map<string, GraphNode>,
  maxDistanceMeters = 2000  // Increased from 500 to 2000m
): GraphNode | null {
  let nearest: GraphNode | null = null;
  let minDist = Infinity;
  
  for (const node of nodes.values()) {
    const dist = haversineDistance(coord, node.coord);
    if (dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  }
  
  console.log(`Nearest node is ${minDist.toFixed(0)}m away`);
  
  if (minDist > maxDistanceMeters) {
    console.log(`Too far! Max is ${maxDistanceMeters}m`);
    return null;
  }
  
  return nearest;
}

// Find nearest node that has at least minEdges connections (intersection)
function findNearestNodeWithEdges(
  coord: Coord,
  nodes: Map<string, GraphNode>,
  minEdges: number,
  maxDistanceMeters = 2000
): GraphNode | null {
  let nearest: GraphNode | null = null;
  let minDist = Infinity;
  
  for (const node of nodes.values()) {
    if (node.edges.length < minEdges) continue;
    
    const dist = haversineDistance(coord, node.coord);
    if (dist < minDist && dist <= maxDistanceMeters) {
      minDist = dist;
      nearest = node;
    }
  }
  
  if (nearest) {
    console.log(`Nearest intersection (${minEdges}+ edges) is ${minDist.toFixed(0)}m away with ${nearest.edges.length} edges`);
  }
  
  return nearest;
}

// ---------------------------------------------------------
// Modified A* for route planning with distance target
// ---------------------------------------------------------
interface SearchState {
  nodeId: string;
  totalDistance: number;
  unrunDistance: number;
  visitedEdges: Set<string>;
  path: string[];
  edgePath: GraphEdge[];
}

function routeHeuristic(
  state: SearchState,
  endNode: GraphNode,
  targetDistance: number,
  currentNode: GraphNode,
  unrunWeight: number
): number {
  const distanceToEnd = haversineDistance(currentNode.coord, endNode.coord);
  const remainingTarget = targetDistance - state.totalDistance;
  
  // Penalize being too far from target distance
  const distancePenalty = Math.abs(remainingTarget - distanceToEnd) * 0.5;
  
  // Reward unrun coverage (negative value = better)
  const unrunBonus = -state.unrunDistance * unrunWeight;
  
  return distanceToEnd + distancePenalty + unrunBonus;
}

export function planRoute(options: RoutePlannerOptions): PlannedRoute | null {
  const {
    startPoint,
    endPoint,
    targetDistanceMiles,
    streets,
    preferUnrun = true
  } = options;
  
  const targetDistanceMeters = targetDistanceMiles * METERS_PER_MILE;
  const tolerance = targetDistanceMeters * 0.15; // 15% tolerance
  
  // Build graph
  const graph = buildStreetGraph(streets);
  
  if (graph.size === 0) {
    console.warn('No streets to build graph from');
    return null;
  }
  
  // Find start and end nodes
  const startNode = findNearestNode(startPoint, graph);
  const endNode = findNearestNode(endPoint, graph);
  
  if (!startNode || !endNode) {
    console.warn('Could not find start or end node near specified points');
    return null;
  }
  
  const isLoop = startNode.id === endNode.id;
  const unrunWeight = preferUnrun ? 0.3 : 0;
  
  // Priority queue for exploration
  const queue = new PriorityQueue<SearchState>();
  
  // Best solutions found
  let bestRoute: SearchState | null = null;
  let bestScore = -Infinity;
  
  // Initial state
  const initialState: SearchState = {
    nodeId: startNode.id,
    totalDistance: 0,
    unrunDistance: 0,
    visitedEdges: new Set(),
    path: [startNode.id],
    edgePath: []
  };
  
  queue.enqueue(initialState, 0);
  
  // Exploration limit
  const maxIterations = 50000;
  let iterations = 0;
  
  // Visited states (node + approximate distance)
  const visited = new Map<string, number>();
  
  while (!queue.isEmpty() && iterations < maxIterations) {
    iterations++;
    
    const state = queue.dequeue()!;
    const currentNode = graph.get(state.nodeId);
    
    if (!currentNode) continue;
    
    // State key for pruning (node + distance bucket)
    const distBucket = Math.floor(state.totalDistance / 100);
    const stateKey = `${state.nodeId}:${distBucket}`;
    
    // Skip if we've visited this state with better unrun coverage
    const prevUnrun = visited.get(stateKey) ?? -1;
    if (state.unrunDistance <= prevUnrun && iterations > 1000) {
      continue;
    }
    visited.set(stateKey, state.unrunDistance);
    
    // Check if this is a valid end state
    const isAtEnd = state.nodeId === endNode.id;
    const withinTarget = Math.abs(state.totalDistance - targetDistanceMeters) <= tolerance;
    const hasMinDistance = state.totalDistance >= targetDistanceMeters * 0.7;
    
    if (isAtEnd && hasMinDistance) {
      // Score this solution
      const distanceAccuracy = 1 - Math.abs(state.totalDistance - targetDistanceMeters) / targetDistanceMeters;
      const unrunRatio = state.totalDistance > 0 ? state.unrunDistance / state.totalDistance : 0;
      const score = distanceAccuracy * 0.4 + unrunRatio * 0.6;
      
      if (score > bestScore) {
        bestScore = score;
        bestRoute = state;
        
        // If we found a good enough solution, we can stop early
        if (withinTarget && unrunRatio > 0.5) {
          break;
        }
      }
    }
    
    // Don't explore further if way over target
    if (state.totalDistance > targetDistanceMeters * 1.3) {
      continue;
    }
    
    // Explore edges
    for (const edge of currentNode.edges) {
      const edgeKey = `${state.nodeId}->${edge.toNodeId}:${edge.streetId}`;
      
      // Prefer not revisiting the same edge
      const revisitPenalty = state.visitedEdges.has(edgeKey) ? 0.5 : 0;
      
      const newState: SearchState = {
        nodeId: edge.toNodeId,
        totalDistance: state.totalDistance + edge.distance,
        unrunDistance: state.unrunDistance + (edge.isUnrun ? edge.distance : 0),
        visitedEdges: new Set([...state.visitedEdges, edgeKey]),
        path: [...state.path, edge.toNodeId],
        edgePath: [...state.edgePath, edge]
      };
      
      const nextNode = graph.get(edge.toNodeId);
      if (!nextNode) continue;
      
      const priority = routeHeuristic(
        newState,
        endNode,
        targetDistanceMeters,
        nextNode,
        unrunWeight
      ) + revisitPenalty * 500;
      
      queue.enqueue(newState, priority);
    }
  }
  
  console.log(`Route planning completed after ${iterations} iterations`);
  
  if (!bestRoute) {
    console.warn('No valid route found');
    return null;
  }
  
  // Convert to PlannedRoute
  return convertToPlannedRoute(bestRoute, graph);
}

function convertToPlannedRoute(
  state: SearchState,
  graph: Map<string, GraphNode>
): PlannedRoute {
  const segments: RouteSegment[] = [];
  const fullPath: Coord[] = [];
  
  for (let i = 0; i < state.edgePath.length; i++) {
    const edge = state.edgePath[i];
    const fromNode = graph.get(state.path[i])!;
    const toNode = graph.get(state.path[i + 1])!;
    
    segments.push({
      from: {
        coord: fromNode.coord,
        streetId: edge.streetId,
        nodeId: fromNode.id
      },
      to: {
        coord: toNode.coord,
        streetId: edge.streetId,
        nodeId: toNode.id
      },
      distance: edge.distance,
      streetId: edge.streetId,
      streetName: edge.streetName,
      isUnrun: edge.isUnrun
    });
    
    // Add coordinates to path (skip first coord if not first segment to avoid duplicates)
    if (i === 0) {
      fullPath.push(...edge.coords);
    } else {
      fullPath.push(...edge.coords.slice(1));
    }
  }
  
  return {
    segments,
    totalDistance: state.totalDistance,
    unrunDistance: state.unrunDistance,
    unrunPercentage: state.totalDistance > 0 
      ? (state.unrunDistance / state.totalDistance) * 100 
      : 0,
    path: fullPath
  };
}

// ---------------------------------------------------------
// Alternative: Greedy route builder for faster results
// ---------------------------------------------------------
export function planRouteGreedy(options: RoutePlannerOptions): PlannedRoute | null {
  const {
    startPoint,
    endPoint,
    targetDistanceMiles,
    streets,
    preferUnrun = true
  } = options;
  
  console.log(`planRouteGreedy called with ${streets.length} streets, target ${targetDistanceMiles} miles`);
  console.log(`Start point: ${startPoint.latitude}, ${startPoint.longitude}`);
  
  if (streets.length === 0) {
    console.log('No streets provided!');
    return null;
  }
  
  const targetDistanceMeters = targetDistanceMiles * METERS_PER_MILE;
  
  // Build graph
  const graph = buildStreetGraph(streets);
  
  if (graph.size === 0) {
    console.log('No nodes in graph - streets may not have coords');
    throw new Error('No street data available. Please load streets first.');
  }
  
  // Find start node - prefer one with multiple edges (intersection) near the point
  let startNode = findNearestNodeWithEdges(startPoint, graph, 2); // Prefer 2+ edges
  if (!startNode) {
    startNode = findNearestNode(startPoint, graph); // Fall back to any node
  }
  
  let endNode = findNearestNodeWithEdges(endPoint, graph, 2);
  if (!endNode) {
    endNode = findNearestNode(endPoint, graph);
  }
  
  if (!startNode) {
    console.log('Could not find start node near the given point');
    throw new Error('Start point is too far from loaded streets (max ~1.2 miles). Try a location closer to your street data.');
  }
  if (!endNode) {
    console.log('Could not find end node near the given point');
    throw new Error('End point is too far from loaded streets (max ~1.2 miles). Try a location closer to your street data.');
  }
  
  console.log(`Start node has ${startNode.edges.length} edges`);
  
  if (startNode.edges.length === 0) {
    console.log('Start node has no edges - cannot plan route');
    return null;
  }
  
  // Track edges used in this route to avoid repeats
  const usedEdges = new Set<string>();
  let repeatCount = 0;
  
  // Greedy exploration
  const state: SearchState = {
    nodeId: startNode.id,
    totalDistance: 0,
    unrunDistance: 0,
    visitedEdges: new Set(),
    path: [startNode.id],
    edgePath: []
  };
  
  const maxSteps = 500;
  let steps = 0;
  
  while (state.totalDistance < targetDistanceMeters * 0.95 && steps < maxSteps) {
    steps++;
    
    const currentNode = graph.get(state.nodeId);
    if (!currentNode || currentNode.edges.length === 0) {
      console.log(`Dead end at step ${steps}, trying to find alternate path`);
      break;
    }
    
    // Get edges we haven't used yet
    const unusedEdges = currentNode.edges.filter(edge => !usedEdges.has(edge.streetId));
    
    // If no unused edges available, we MUST repeat - pick the least bad option
    const mustRepeat = unusedEdges.length === 0;
    const edgesToConsider = mustRepeat ? currentNode.edges : unusedEdges;
    
    if (mustRepeat && steps <= 10) {
      console.log(`FORCED REPEAT at step ${steps} (node has ${currentNode.edges.length} total edges)`);
    }
    
    if (edgesToConsider.length === 0) {
      console.log(`No edges at step ${steps}`);
      break;
    }
    
    // Simple scoring
    const scoredEdges = edgesToConsider.map(edge => {
      let score = Math.random() * 20; // Random base for variety
      
      // Prefer unrun streets
      if (edge.isUnrun && preferUnrun) {
        score += 100;
      }
      
      // Penalize already-used edges heavily (shouldn't happen if unusedEdges has items)
      if (usedEdges.has(edge.streetId)) {
        score -= 1000;
      }
      
      // Bonus for edges leading to nodes with more unused options
      const toNode = graph.get(edge.toNodeId);
      if (toNode) {
        const futureOptions = toNode.edges.filter(e => !usedEdges.has(e.streetId)).length;
        score += futureOptions * 30; // Big bonus for having more options ahead
      }
      
      // Late in route: head toward end
      const progressRatio = state.totalDistance / targetDistanceMeters;
      if (progressRatio > 0.6) {
        if (toNode) {
          const distToEnd = haversineDistance(toNode.coord, endNode.coord);
          score -= distToEnd * (progressRatio - 0.5) * 0.8;
        }
      }
      
      return { edge, score };
    });
    
    // Sort and pick best
    scoredEdges.sort((a, b) => b.score - a.score);
    const bestEdge = scoredEdges[0].edge;
    
    // Track if this is a repeat
    if (usedEdges.has(bestEdge.streetId)) {
      repeatCount++;
    }
    
    // Add to path
    usedEdges.add(bestEdge.streetId);
    state.visitedEdges.add(bestEdge.streetId);
    state.totalDistance += bestEdge.distance;
    state.unrunDistance += bestEdge.isUnrun ? bestEdge.distance : 0;
    state.path.push(bestEdge.toNodeId);
    state.edgePath.push(bestEdge);
    state.nodeId = bestEdge.toNodeId;
    
    // Check if we reached the end
    if (state.nodeId === endNode.id && state.totalDistance >= targetDistanceMeters * 0.7) {
      console.log(`Reached end at step ${steps}`);
      break;
    }
  }
  
  console.log(`Route planning done: ${steps} steps, ${(state.totalDistance/1609).toFixed(2)} miles, ${state.edgePath.length} segments, ${repeatCount} repeats, ${usedEdges.size} unique streets`);
  
  // If not at end, try to find path to end
  if (state.nodeId !== endNode.id) {
    console.log('Finding path back to end...');
    const pathToEnd = findShortestPath(state.nodeId, endNode.id, graph);
    if (pathToEnd) {
      console.log(`Found return path with ${pathToEnd.length} segments`);
      for (const edge of pathToEnd) {
        if (usedEdges.has(edge.streetId)) repeatCount++;
        state.totalDistance += edge.distance;
        state.unrunDistance += edge.isUnrun ? edge.distance : 0;
        state.path.push(edge.toNodeId);
        state.edgePath.push(edge);
      }
    }
  }
  
  console.log(`Final: ${state.edgePath.length} segments, ${repeatCount} repeats (${((repeatCount/state.edgePath.length)*100).toFixed(0)}%)`);
  
  if (state.edgePath.length === 0) {
    console.log('No path found');
    return null;
  }
  
  return convertToPlannedRoute(state, graph);
}

// Simple BFS for shortest path
function findShortestPath(
  fromId: string,
  toId: string,
  graph: Map<string, GraphNode>
): GraphEdge[] | null {
  if (fromId === toId) return [];
  
  const queue: { nodeId: string; path: GraphEdge[] }[] = [{ nodeId: fromId, path: [] }];
  const visited = new Set<string>([fromId]);
  
  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    const node = graph.get(nodeId);
    
    if (!node) continue;
    
    for (const edge of node.edges) {
      if (edge.toNodeId === toId) {
        return [...path, edge];
      }
      
      if (!visited.has(edge.toNodeId)) {
        visited.add(edge.toNodeId);
        queue.push({ nodeId: edge.toNodeId, path: [...path, edge] });
      }
    }
  }
  
  return null;
}

// Weighted shortest path that prefers avoiding already-used streets
function findShortestPathAvoidingStreets(
  fromId: string,
  toId: string,
  graph: Map<string, GraphNode>,
  usedStreetIds: Set<string>
): GraphEdge[] | null {
  if (fromId === toId) return [];
  
  // Dijkstra-like approach with weighted edges
  const distances = new Map<string, number>();
  const previous = new Map<string, { nodeId: string; edge: GraphEdge } | null>();
  const unvisited = new Set<string>();
  
  // Initialize
  for (const nodeId of graph.keys()) {
    distances.set(nodeId, Infinity);
    previous.set(nodeId, null);
    unvisited.add(nodeId);
  }
  distances.set(fromId, 0);
  
  while (unvisited.size > 0) {
    // Find unvisited node with smallest distance
    let currentId: string | null = null;
    let currentDist = Infinity;
    
    for (const nodeId of unvisited) {
      const dist = distances.get(nodeId)!;
      if (dist < currentDist) {
        currentDist = dist;
        currentId = nodeId;
      }
    }
    
    if (currentId === null || currentDist === Infinity) break;
    if (currentId === toId) break;
    
    unvisited.delete(currentId);
    
    const node = graph.get(currentId);
    if (!node) continue;
    
    for (const edge of node.edges) {
      if (!unvisited.has(edge.toNodeId)) continue;
      
      // Weight: base distance + heavy penalty for reusing streets
      const reusePenalty = usedStreetIds.has(edge.streetId) ? edge.distance * 3 : 0;
      const weight = edge.distance + reusePenalty;
      
      const newDist = currentDist + weight;
      
      if (newDist < distances.get(edge.toNodeId)!) {
        distances.set(edge.toNodeId, newDist);
        previous.set(edge.toNodeId, { nodeId: currentId, edge });
      }
    }
  }
  
  // Reconstruct path
  if (previous.get(toId) === null) {
    // Fall back to regular shortest path if weighted search failed
    return findShortestPath(fromId, toId, graph);
  }
  
  const path: GraphEdge[] = [];
  let current = toId;
  
  while (current !== fromId) {
    const prev = previous.get(current);
    if (!prev) break;
    path.unshift(prev.edge);
    current = prev.nodeId;
  }
  
  return path.length > 0 ? path : null;
}

// ---------------------------------------------------------
// Utility: Get route statistics
// ---------------------------------------------------------
export function getRouteStats(route: PlannedRoute): {
  distanceMiles: number;
  unrunDistanceMiles: number;
  unrunPercentage: number;
  segmentCount: number;
  unrunSegmentCount: number;
  uniqueStreetCount: number;
  repeatedSegments: number;
} {
  // Count unique streets and repeated segments
  const streetCounts = new Map<string, number>();
  for (const seg of route.segments) {
    streetCounts.set(seg.streetId, (streetCounts.get(seg.streetId) || 0) + 1);
  }
  
  const uniqueStreetCount = streetCounts.size;
  const repeatedSegments = route.segments.length - uniqueStreetCount;
  
  return {
    distanceMiles: route.totalDistance / METERS_PER_MILE,
    unrunDistanceMiles: route.unrunDistance / METERS_PER_MILE,
    unrunPercentage: route.unrunPercentage,
    segmentCount: route.segments.length,
    unrunSegmentCount: route.segments.filter(s => s.isUnrun).length,
    uniqueStreetCount,
    repeatedSegments
  };
}

// ---------------------------------------------------------
// Generate text directions from route
// ---------------------------------------------------------
export interface RouteDirection {
  step: number;
  streetName: string;
  distanceMeters: number;
  distanceMiles: number;
  isUnrun: boolean;
  cumulativeDistanceMiles: number;
}

export function getRouteDirections(route: PlannedRoute): RouteDirection[] {
  const directions: RouteDirection[] = [];
  let cumulativeDistance = 0;
  let currentStreet: string | null = null;
  let currentDistance = 0;
  let currentIsUnrun = false;
  let step = 0;
  
  for (const segment of route.segments) {
    if (segment.streetName === currentStreet) {
      // Continue on same street - accumulate distance
      currentDistance += segment.distance;
    } else {
      // New street - push previous if exists
      if (currentStreet !== null) {
        step++;
        cumulativeDistance += currentDistance;
        directions.push({
          step,
          streetName: currentStreet,
          distanceMeters: currentDistance,
          distanceMiles: currentDistance / METERS_PER_MILE,
          isUnrun: currentIsUnrun,
          cumulativeDistanceMiles: cumulativeDistance / METERS_PER_MILE
        });
      }
      // Start new street
      currentStreet = segment.streetName;
      currentDistance = segment.distance;
      currentIsUnrun = segment.isUnrun;
    }
  }
  
  // Push final street
  if (currentStreet !== null) {
    step++;
    cumulativeDistance += currentDistance;
    directions.push({
      step,
      streetName: currentStreet,
      distanceMeters: currentDistance,
      distanceMiles: currentDistance / METERS_PER_MILE,
      isUnrun: currentIsUnrun,
      cumulativeDistanceMiles: cumulativeDistance / METERS_PER_MILE
    });
  }
  
  return directions;
}

// ---------------------------------------------------------
// Export route as GeoJSON for visualization
// ---------------------------------------------------------
export function routeToGeoJSON(route: PlannedRoute): object {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          totalDistance: route.totalDistance,
          unrunDistance: route.unrunDistance,
          unrunPercentage: route.unrunPercentage
        },
        geometry: {
          type: 'LineString',
          coordinates: route.path.map(c => [c.longitude, c.latitude])
        }
      },
      ...route.segments.map((seg, i) => ({
        type: 'Feature',
        properties: {
          segmentIndex: i,
          streetId: seg.streetId,
          isUnrun: seg.isUnrun,
          distance: seg.distance
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [seg.from.coord.longitude, seg.from.coord.latitude],
            [seg.to.coord.longitude, seg.to.coord.latitude]
          ]
        }
      }))
    ]
  };
}
