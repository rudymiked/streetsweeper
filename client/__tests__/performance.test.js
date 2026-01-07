const { performance } = require('perf_hooks');
const { decodePolyline } = require('../src/state/core/decodePolyline');
const { streetWasRun } = require('../src/state/core/geometry');
const { streetWasRunStrict } = require('../src/state/core/geometry_strict');
const { matchStreets } = require('../src/state/core/matcher_kdtree');

const strava = require('../__tests__/mock-data/strava.json');
const osm = require('../__tests__/mock-data/osm.json');

// Normalize OSM data
const osmStreets = (osm.elements || osm).map(s => ({
    id: String(s.id),
    name: s.tags?.name || "Unknown",
    completed: false,
    coords: (s.geometry || []).map(g => ({
        latitude: g.lat,
        longitude: g.lon
    }))
}));

// Normalize Strava data
const stravaActivities = strava.map(a => ({
    id: a.id,
    name: a.name,
    map: {
        summary_polyline: a.map?.summary_polyline || null
    }
}));

// Mock data
const mockStreet = {
    id: "1",
    name: "Test Street",
    completed: false,
    coords: [
        { latitude: 47.0, longitude: -122.0 },
        { latitude: 47.0005, longitude: -122.0005 },
        { latitude: 47.001, longitude: -122.001 }
    ]
};

const mockActivity = {
    id: 100,
    name: "Test Run",
    map: {
        summary_polyline: "gfo}EtohhUxD@bAxJmGF"
    }
};

describe("Performance Benchmarks", () => {
    test("decodePolyline speed", () => {
        const start = performance.now();
        for (let i = 0; i < 10000; i++) {
            decodePolyline(mockActivity.map.summary_polyline);
        }
        const end = performance.now();
        console.log("decodePolyline x10k:", (end - start).toFixed(2), "ms");
    });

    test("streetWasRun speed", () => {
        const activityCoords = decodePolyline(mockActivity.map.summary_polyline);

        const start = performance.now();
        for (let i = 0; i < 2000; i++) {
            streetWasRun(mockStreet.coords, activityCoords, 20);
        }
        const end = performance.now();
        console.log("streetWasRun x2000:", (end - start).toFixed(2), "ms");
    });

    test("streetWasRunStrict speed", () => {
        const activityCoords = decodePolyline(mockActivity.map.summary_polyline);

        const start = performance.now();
        for (let i = 0; i < 2000; i++) {
            streetWasRunStrict(mockStreet.coords, activityCoords, 20);
        }
        const end = performance.now();
        console.log("streetWasRunStrict x2000:", (end - start).toFixed(2), "ms");
    });

    test("matchStreets speed", async () => {
        const streets = Array.from({ length: 500 }, (_, i) => ({
            ...mockStreet,
            id: String(i)
        }));

        const activities = Array.from({ length: 50 }, () => mockActivity);

        const start = performance.now();
        await matchStreets(streets, activities, 20);
        const end = performance.now();

        console.log("matchStreets (500 streets, 50 acts):", (end - start).toFixed(2), "ms");
    });
});

describe("Real-world performance tests", () => {
    test("decodePolyline on all Strava activities", () => {
        const start = performance.now();

        for (const act of strava) {
            if (act.map?.summary_polyline) {
                decodePolyline(act.map.summary_polyline);
            }
        }

        const end = performance.now();
        console.log("decodePolyline on all activities:", (end - start).toFixed(2), "ms");
    });

    test("streetWasRun on sample street vs sample activity", () => {
        const street = osmStreets[0];
        const act = stravaActivities.find(a => a.map.summary_polyline);
        const coords = decodePolyline(act.map.summary_polyline);

        const start = performance.now();
        for (let i = 0; i < 2000; i++) {
            streetWasRun(street.coords, coords, 20);
            progress(i, 2000);
        }

        const end = performance.now();

        console.log("streetWasRun x2000:", (end - start).toFixed(2), "ms");
    });

    test("matchStreets on full dataset", async () => {
        const start = performance.now();

        console.log("Starting full matcher test...");
        console.log(`Total streets: ${osmStreets.length}, Total activities: ${stravaActivities.length}`);

        await matchStreets(osmStreets, stravaActivities, 20);

        const end = performance.now();
        console.log("Full matcher (3000 streets, 667 acts):", (end - start).toFixed(2), "ms");
    });
});

function progress(i, total, step = 100) {
  if (i % step === 0) {
    console.log(`Progress: ${i}/${total}`);
  }
}
