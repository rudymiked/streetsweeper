import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import WebMapView from './WebMapView';
import { useAppState } from '../state/StateContext';
import Slider from '@react-native-community/slider';
import { Street } from '../state/matching/matcher_kdtree';
import { palette } from '../theme/palette';

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
        mapTheme,
        setMapTheme,
        toggleStreet
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
                mapTheme={mapTheme}
                showStravaOverlay={showStravaOverlay}
                showConfidenceOverlay={showConfidenceOverlay}
                onToggleStreet={toggleStreet}
            />

            <div style={styles.debugOverlay}>
                <div style={styles.debugHeading}>Run State</div>
                <div style={styles.debugRow}>Streets<span style={styles.debugValue}>{streets.length}</span></div>
                <div style={styles.debugRow}>Visible<span style={styles.debugValue}>{visible.length}</span></div>
                <div style={styles.debugRow}>Activities<span style={styles.debugValue}>{activities.length}</span></div>
                <div style={styles.debugRow}>Radius<span style={styles.debugValue}>{radiusMiles.toFixed(1)} mi</span></div>
            </div>

            {sidebarOpen && (
                <View style={styles.sidebar}>
                    <div style={styles.sidebarTitle}>Controls</div>

                    <View style={styles.row}>
                        <div style={styles.label}>Show Completed</div>
                        <Switch
                            value={showCompleted}
                            onValueChange={setShowCompleted}
                            trackColor={{ false: '#1f2e45', true: palette.accent }}
                            thumbColor={showCompleted ? '#0b1224' : '#0c182d'}
                            ios_backgroundColor="#1f2e45"
                        />
                    </View>

                    <View style={styles.row}>
                        <div style={styles.label}>Show Unrun</div>
                        <Switch
                            value={showUnrun}
                            onValueChange={setShowUnrun}
                            trackColor={{ false: '#1f2e45', true: palette.accent }}
                            thumbColor={showUnrun ? '#0b1224' : '#0c182d'}
                            ios_backgroundColor="#1f2e45"
                        />
                    </View>

                    <View style={styles.row}>
                        <div style={styles.label}>Strava Overlay</div>
                        <Switch
                            value={showStravaOverlay}
                            onValueChange={setShowStravaOverlay}
                            trackColor={{ false: '#1f2e45', true: palette.accent }}
                            thumbColor={showStravaOverlay ? '#0b1224' : '#0c182d'}
                            ios_backgroundColor="#1f2e45"
                        />
                    </View>

                    <View style={styles.row}>
                        <div style={styles.label}>Confidence Overlay</div>
                        <Switch
                            value={showConfidenceOverlay}
                            onValueChange={setShowConfidenceOverlay}
                            trackColor={{ false: '#1f2e45', true: palette.accent }}
                            thumbColor={showConfidenceOverlay ? '#0b1224' : '#0c182d'}
                            ios_backgroundColor="#1f2e45"
                        />
                    </View>

                    <View style={styles.row}>
                        <div style={styles.label}>Map Theme</div>
                        <Switch
                            value={mapTheme === 'dark'}
                            onValueChange={(val) => setMapTheme(val ? 'dark' : 'light')}
                            trackColor={{ false: '#1f2e45', true: palette.accent }}
                            thumbColor={mapTheme === 'dark' ? '#0b1224' : '#0c182d'}
                            ios_backgroundColor="#1f2e45"
                        />
                    </View>

                    <div style={styles.sliderLabel}>Radius: {radiusMiles.toFixed(1)} mi</div>
                    <Slider
                        minimumValue={0.5}
                        maximumValue={5}
                        step={0.1}
                        value={radiusMiles}
                        onValueChange={setRadiusMiles}
                        style={{ width: '100%' }}
                        minimumTrackTintColor={palette.accentStrong}
                        maximumTrackTintColor="#1f2e45"
                        thumbTintColor={palette.accent}
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
    container: {
        flex: 1,
        background: palette.gradient,
    },
    debugOverlay: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        background: palette.overlay,
        color: palette.text,
        padding: 12,
        borderRadius: 10,
        fontSize: 12,
        zIndex: 9999,
        minWidth: 170,
        border: `1px solid ${palette.panelBorder}`,
        boxShadow: palette.shadow,
        backdropFilter: 'blur(6px)',
    },
    debugHeading: {
        fontWeight: 'bold',
        letterSpacing: 0.3,
        marginBottom: 6,
        color: palette.accent,
    },
    debugRow: {
        display: 'flex',
        justifyContent: 'space-between',
        color: palette.text,
        padding: '2px 0',
    },
    debugValue: {
        color: palette.muted,
        marginLeft: 10,
    },
    sidebar: {
        position: 'absolute',
        top: 70,
        right: 20,
        width: 240,
        background: palette.panel,
        padding: 14,
        borderRadius: 12,
        boxShadow: palette.shadow,
        zIndex: 9999,
        color: palette.text,
        border: `1px solid ${palette.panelBorder}`,
        backdropFilter: 'blur(6px)',
    },
    hamburger: {
        position: 'absolute',
        top: 20,
        right: 20,
        fontSize: 18,
        padding: '10px 12px',
        zIndex: 9999,
        background: palette.accent,
        color: '#0b1224',
        border: 'none',
        borderRadius: 10,
        boxShadow: palette.shadow,
        cursor: 'pointer',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 8,
        paddingVertical: 6,
        borderBottom: `1px solid ${palette.panelBorder}`,
    },
    sidebarTitle: {
        fontWeight: 'bold',
        marginBottom: 12,
        fontSize: 17,
        color: palette.text,
        letterSpacing: 0.3,
    },
    sliderLabel: {
        marginTop: 12,
        marginBottom: 6,
        color: palette.muted,
        fontSize: 13,
        letterSpacing: 0.2,
    },
    label: {
        color: palette.text,
        fontSize: 14,
        letterSpacing: 0.2,
    },
};
