import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import WebMapView from './WebMapView';
import { useAppState } from '../state/StateContext';
import Slider from '@react-native-community/slider';
import { Street } from '../state/matching/matcher_kdtree';

export default function MapScreenWeb() {
    const {
        center,
        streets,
        activities,
        showCompleted,
        setShowCompleted,
        showUnrun,
        setShowUnrun,
        showStravaOverlay,
        setShowStravaOverlay,
        showConfidenceOverlay,
        setShowConfidenceOverlay,
        radiusMiles,
        setRadiusMiles,
    } = useAppState();

    const [sidebarOpen, setSidebarOpen] = useState(true);

    const visible = streets.filter((s) => {
        const passesCompletion =
            (s.completed && showCompleted) ||
            (!s.completed && showUnrun);

        return passesCompletion && streetWithinRadius(s, center, radiusMiles);
    });

    function streetWithinRadius(street: Street, center: { latitude: number; longitude: number }, radiusMiles: number) {
        const R = 3958.8; // Earth radius in miles

        // Compute min distance from any street point to center
        let minDist = Infinity;

        for (const c of street.coords) {
            const dLat = (c.latitude - center.latitude) * (Math.PI / 180);
            const dLon = (c.longitude - center.longitude) * (Math.PI / 180);

            const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos(center.latitude * Math.PI / 180) *
                Math.cos(c.latitude * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;

            const dist = 2 * R * Math.asin(Math.sqrt(a));
            minDist = Math.min(minDist, dist);
        }

        return minDist <= radiusMiles;
    }

    return (
        <View style={styles.container}>
            <WebMapView
                center={center}
                streets={visible}
                activities={activities}
                showStravaOverlay={showStravaOverlay}
                showConfidenceOverlay={showConfidenceOverlay}
            />

            <div style={styles.debugOverlay}>
                <div>Streets: {streets.length}</div>
                <div>Visible: {visible.length}</div>
                <div>Activities: {activities.length}</div>
                <div>Radius: {radiusMiles.toFixed(1)} mi</div>
            </div>

            {sidebarOpen && (
                <View style={styles.sidebar}>
                    <div style={styles.sidebarTitle}>Controls</div>

                    <View style={styles.row}>
                        <div>Show Completed</div>
                        <Switch value={showCompleted} onValueChange={setShowCompleted} />
                    </View>

                    <View style={styles.row}>
                        <div>Show Unrun</div>
                        <Switch value={showUnrun} onValueChange={setShowUnrun} />
                    </View>

                    <View style={styles.row}>
                        <div>Strava Overlay</div>
                        <Switch value={showStravaOverlay} onValueChange={setShowStravaOverlay} />
                    </View>

                    <View style={styles.row}>
                        <div>Confidence Overlay</div>
                        <Switch value={showConfidenceOverlay} onValueChange={setShowConfidenceOverlay} />
                    </View>

                    <div style={styles.sliderLabel}>Radius: {radiusMiles.toFixed(1)} mi</div>
                    <Slider
                        minimumValue={0.5}
                        maximumValue={5}
                        step={0.1}
                        value={radiusMiles}
                        onValueChange={setRadiusMiles}
                        style={{ width: '100%' }}
                    />
                </View>
            )}

            <button
                style={styles.hamburger}
                onClick={() => setSidebarOpen(!sidebarOpen)}
            >
                ☰
            </button>
        </View>
    );
}

const styles: any = {
    container: { flex: 1 },
    debugOverlay: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        background: 'rgba(0,0,0,0.55)',
        color: 'white',
        padding: 8,
        borderRadius: 6,
        fontSize: 12,
        zIndex: 9999,
    },
    sidebar: {
        position: 'absolute',
        top: 70,
        right: 20,
        width: 220,
        background: 'white',
        padding: 12,
        borderRadius: 8,
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        zIndex: 9999,
    },
    hamburger: {
        position: 'absolute',
        top: 20,
        right: 20,
        fontSize: 22,
        padding: 8,
        zIndex: 9999,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 6,
    },
    sidebarTitle: {
        fontWeight: 'bold',
        marginBottom: 10,
        fontSize: 16,
    },
    sliderLabel: {
        marginTop: 10,
        marginBottom: 4,
    },
};
