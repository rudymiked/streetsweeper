// state/core/matcher_kdtree.ts
import { decodePolyline } from "./decodePolyline";
import { Coord, degToMeters, pointToSegmentDistanceMeters, segmentsIntersect } from "./geometry";
import { KDPoint, KDNode, buildKDTree, kdRangeSearch } from "./kdtree";

export type Street = {
    id: string;
    name: string;
    completed: boolean;
    coords: Coord[];
};

export type Activity = {
    id: number;
    name: string;
    decoded: Coord[];
};

function buildActivityKDTree(activities: Activity[]): KDNode | null {
    const points: KDPoint[] = [];

    activities.forEach((act, activityIndex) => {
        const coords = act.decoded;

        for (let i = 0; i < coords.length - 1; i++) {
            const a = coords[i];
            const b = coords[i + 1];

            const mid = {
                latitude: (a.latitude + b.latitude) / 2,
                longitude: (a.longitude + b.longitude) / 2
            };

            const m = degToMeters(mid);

            points.push({
                x: m.x,
                y: m.y,
                segIndex: i,
                activityIndex
            });
        }
    });

    return buildKDTree(points);
}

export async function matchStreetsKDTree(
    streets: Street[],
    activities: Activity[],
    toleranceMeters = 6
): Promise<Street[]> {

    const tree = buildActivityKDTree(activities);
    const updated: Street[] = [];

    const total = streets.length;

    for (let i = 0; i < streets.length; i++) {
        const street = streets[i];

        if (i % 100 === 0) {
            console.log(`KD matcher progress: ${i}/${total}`);
        }

        let wasRun = false;

        for (let j = 0; j < street.coords.length - 1 && !wasRun; j++) {
            const a = street.coords[j];
            const b = street.coords[j + 1];

            const mid = {
                latitude: (a.latitude + b.latitude) / 2,
                longitude: (a.longitude + b.longitude) / 2
            };

            const m = degToMeters(mid);
            const range = toleranceMeters * 2;

            const nearby = kdRangeSearch(
                tree,
                m.x - range,
                m.x + range,
                m.y - range,
                m.y + range
            );

            for (const pt of nearby) {
                const act = activities[pt.activityIndex];
                const segIndex = pt.segIndex;

                const actA = act.decoded[segIndex];
                const actB = act.decoded[segIndex + 1];

                const A1 = degToMeters(a);
                const A2 = degToMeters(b);
                const B1 = degToMeters(actA);
                const B2 = degToMeters(actB);

                if (segmentsIntersect(A1, A2, B1, B2)) {
                    wasRun = true;
                    break;
                }

                const d1 = pointToSegmentDistanceMeters(A1, B1, B2);
                const d2 = pointToSegmentDistanceMeters(A2, B1, B2);
                const d3 = pointToSegmentDistanceMeters(B1, A1, A2);
                const d4 = pointToSegmentDistanceMeters(B2, A1, A2);

                if (Math.min(d1, d2, d3, d4) < toleranceMeters) {
                    wasRun = true;
                    break;
                }
            }
        }

        updated.push({ ...street, completed: wasRun });
    }

    return updated;
}

export type RawActivity = {
    id: number;
    name: string;
    map: { summary_polyline: string | null };
};

export async function matchStreets(
    streets: Street[],
    activities: RawActivity[],
    toleranceMeters = 6
) {
    // Pre-decode all polylines once
    const decodedActivities = activities.map(a => ({
        ...a,
        decoded: a.map.summary_polyline
            ? decodePolyline(a.map.summary_polyline)
            : []
    }));

    // Run the KD-tree optimized matcher
    return matchStreetsKDTree(streets, decodedActivities, toleranceMeters);
}
