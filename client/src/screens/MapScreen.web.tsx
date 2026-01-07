import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import WebMapView from './WebMapView';
import { useAppState } from '../state/StateContext';
import Slider from '@react-native-community/slider';

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
        radiusMiles,
        setRadiusMiles,
    } = useAppState();

    const [sidebarOpen, setSidebarOpen] = useState(true);

    const visible = streets.filter((s) => {
        const centroid = s.coords[Math.floor(s.coords.length / 2)];
        const dx = centroid.latitude - center.latitude;
        const dy = centroid.longitude - center.longitude;
        const approxMiles = Math.sqrt(dx * dx + dy * dy) * 69; // rough
        return (
            (s.completed ? showCompleted : showUnrun) &&
            approxMiles <= radiusMiles
        );
    });

    return (
        <View style={styles.container}>
            <WebMapView
                center={center}
                streets={visible}
                activities={activities}
                showStravaOverlay={showStravaOverlay}
            />

            {/* Debug Overlay */}
            <div style={styles.debugOverlay}>
                <div>Streets: {streets.length}</div>
                <div>Visible: {visible.length}</div>
                <div>Activities: {activities.length}</div>
                <div>Radius: {radiusMiles.toFixed(1)} mi</div>
            </div>

            {/* Sidebar */}
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
        top: 20,
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
};
