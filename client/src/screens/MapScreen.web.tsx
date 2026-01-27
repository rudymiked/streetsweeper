import React, { useState, useCallback, useEffect } from 'react';
import { Switch, View } from 'react-native';
import WebMapView from './WebMapView';
import { useAppState } from '../state/StateContext';
import Slider from '@react-native-community/slider';
import { Street } from '../state/matching/matcher_kdtree';
import { palette } from '../theme/palette';
import { planRouteGreedy, getRouteStats, getRouteDirections } from '../state/routing/routePlanner';

// Breakpoint for mobile
const MOBILE_BREAKPOINT = 768;

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
        toggleStreet,
        plannedRoute,
        setPlannedRoute,
        clearPlannedRoute
    } = useAppState();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [routePlannerOpen, setRoutePlannerOpen] = useState(false);
    const [routeDistance, setRouteDistance] = useState('3');
    const [isLoop, setIsLoop] = useState(true);
    const [isPlanning, setIsPlanning] = useState(false);
    const [routeError, setRouteError] = useState<string | null>(null);
    const [startCoords, setStartCoords] = useState('');
    const [endCoords, setEndCoords] = useState('');
    const [useMapCenter, setUseMapCenter] = useState(true);
    const [useMapCenterEnd, setUseMapCenterEnd] = useState(false);
    const [showRouteDetails, setShowRouteDetails] = useState(false);
    
    // Pin placement state - 'start' or 'end' or null
    const [pinTarget, setPinTarget] = useState<'start' | 'end' | null>(null);
    
    // Screen size detection
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
    
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    function parseCoords(input: string): { latitude: number; longitude: number } | null {
        const trimmed = input.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return { latitude: parts[0], longitude: parts[1] };
        }
        return null;
    }

    async function handlePlanRoute() {
        setRouteError(null);
        setIsPlanning(true);

        try {
            const distance = parseFloat(routeDistance);
            if (isNaN(distance) || distance <= 0 || distance > 50) {
                throw new Error('Distance must be between 0 and 50 miles');
            }

            const relevantStreets = streets.filter(s => s.coords.length >= 2);
            console.log(`Total streets: ${streets.length}, Relevant streets (with coords): ${relevantStreets.length}`);
            
            if (relevantStreets.length === 0) {
                throw new Error('No streets loaded. Please load street data first.');
            }

            // Small delay to let UI update
            await new Promise(resolve => setTimeout(resolve, 10));

            // Parse start point
            let startPoint: { latitude: number; longitude: number };
            if (useMapCenter) {
                startPoint = { latitude: center.latitude, longitude: center.longitude };
            } else {
                const parsed = parseCoords(startCoords);
                if (!parsed) {
                    throw new Error('Invalid start location. Use format: lat, lon (e.g., 47.667, -122.384)');
                }
                startPoint = parsed;
            }

            // Parse end point
            let endPoint: { latitude: number; longitude: number };
            if (isLoop) {
                endPoint = startPoint;
            } else if (useMapCenterEnd) {
                endPoint = { latitude: center.latitude, longitude: center.longitude };
            } else {
                const parsed = parseCoords(endCoords);
                if (!parsed) {
                    throw new Error('Invalid end location. Use format: lat, lon (e.g., 47.670, -122.380)');
                }
                endPoint = parsed;
            }

            const route = planRouteGreedy({
                startPoint,
                endPoint,
                targetDistanceMiles: distance,
                streets: relevantStreets,
                preferUnrun: true,
            });

            if (!route) {
                throw new Error('Could not find a valid route. Try adjusting the distance.');
            }

            setPlannedRoute(route);
        } catch (err: any) {
            setRouteError(err.message || 'Failed to plan route');
        } finally {
            setIsPlanning(false);
        }
    }

    const routeStats = plannedRoute ? getRouteStats(plannedRoute) : null;

    const handleMapClick = useCallback((lat: number, lon: number) => {
        if (!pinTarget) return;
        
        const coords = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        
        if (pinTarget === 'start') {
            setStartCoords(coords);
            setUseMapCenter(false);
        } else if (pinTarget === 'end') {
            setEndCoords(coords);
            setUseMapCenterEnd(false);
        }
        
        // Auto-close pin mode after placing
        setPinTarget(null);
    }, [pinTarget]);

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
                plannedRoute={plannedRoute}
                pinMode={pinTarget !== null}
                onMapClick={handleMapClick}
            />

            {/* Debug Overlay - hidden on mobile */}
            {!isMobile && (
                <div style={styles.debugOverlay}>
                    <div style={styles.debugHeading}>Run State</div>
                    <div style={styles.debugRow}>Streets<span style={styles.debugValue}>{streets.length}</span></div>
                    <div style={styles.debugRow}>Visible<span style={styles.debugValue}>{visible.length}</span></div>
                    <div style={styles.debugRow}>Activities<span style={styles.debugValue}>{activities.length}</span></div>
                    <div style={styles.debugRow}>Radius<span style={styles.debugValue}>{radiusMiles.toFixed(1)} mi</span></div>
                </div>
            )}

            {sidebarOpen && (
                <View style={isMobile ? styles.sidebarMobile : styles.sidebar}>
                    <div style={styles.sidebarHeader}>
                        <div style={styles.sidebarTitle}>Controls</div>
                        {isMobile && (
                            <button style={styles.closeBtn} onClick={() => setSidebarOpen(false)}>✕</button>
                        )}
                    </div>

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

            {/* Mobile Route Stats Bar (when route exists and panels closed) */}
            {isMobile && routeStats && !routePlannerOpen && !showRouteDetails && (
                <div style={styles.mobileRouteStatsBar}>
                    <div style={styles.mobileRouteStatsText}>
                        {routeStats.distanceMiles.toFixed(1)} mi • {routeStats.unrunPercentage.toFixed(0)}% new
                    </div>
                    <div style={styles.mobileRouteStatsButtons}>
                        <button 
                            style={styles.mobileRouteStatsBtn}
                            onClick={() => setShowRouteDetails(true)}
                        >
                            Details
                        </button>
                        <button 
                            style={{...styles.mobileRouteStatsBtn, ...styles.mobileRouteStatsBtnClear}}
                            onClick={clearPlannedRoute}
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            {/* Route Planner Button */}
            <button
                style={isMobile ? styles.routePlannerButtonMobile : styles.routePlannerButton}
                onClick={() => setRoutePlannerOpen(!routePlannerOpen)}
            >
                {'Create Route'}
            </button>

            {/* Pin Mode Indicator (mobile) */}
            {isMobile && pinTarget && (
                <div style={styles.pinModeIndicator}>
                    <span>Tap map to set {pinTarget === 'start' ? 'START' : 'END'} point</span>
                    <button style={styles.pinModeCancel} onClick={() => setPinTarget(null)}>Cancel</button>
                </div>
            )}

            {/* Route Planner Panel */}
            {routePlannerOpen && (
                <div style={isMobile ? styles.routePlannerPanelMobile : styles.routePlannerPanel}>
                    {isMobile && <div style={styles.bottomSheetHandle} />}
                    <div style={styles.routePlannerHeader}>
                        <span style={styles.routePlannerTitle}>Route Planner</span>
                        <button 
                            style={styles.closeBtn}
                            onClick={() => setRoutePlannerOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                    
                    {!isMobile && (
                        <p style={styles.routePlannerDesc}>
                            Plan a route that maximizes unrun street coverage
                        </p>
                    )}

                    {/* Start Location */}
                    <div style={styles.inputGroup}>
                        <label style={styles.inputLabel}>Start Location</label>
                        <div style={styles.toggleRow}>
                            <button
                                style={{
                                    ...styles.toggleBtn,
                                    ...(useMapCenter ? styles.toggleBtnActive : {})
                                }}
                                onClick={() => {
                                    setUseMapCenter(true);
                                    setPinTarget(null);
                                }}
                            >
                                Map Center
                            </button>
                            <button
                                style={{
                                    ...styles.toggleBtn,
                                    ...(!useMapCenter ? styles.toggleBtnActive : {})
                                }}
                                onClick={() => {
                                    setUseMapCenter(false);
                                    setPinTarget(null);
                                }}
                            >
                                Custom
                            </button>
                            <button
                                style={{
                                    ...styles.toggleBtn,
                                    ...styles.pinBtn,
                                    ...(pinTarget === 'start' ? styles.pinBtnActive : {})
                                }}
                                onClick={() => {
                                    setPinTarget(pinTarget === 'start' ? null : 'start');
                                    setUseMapCenter(false);
                                }}
                            >
                                📍 {pinTarget === 'start' ? 'Click Map...' : 'Drop Pin'}
                            </button>
                        </div>
                        {!useMapCenter && (
                            <input
                                type="text"
                                style={{ ...styles.input, marginTop: 8 }}
                                value={startCoords}
                                onChange={(e) => setStartCoords(e.target.value)}
                                placeholder="lat, lon (e.g., 47.667, -122.384)"
                            />
                        )}
                        {useMapCenter && (
                            <div style={styles.coordDisplay}>
                                {center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}
                            </div>
                        )}
                    </div>

                    {/* Route Type */}
                    <div style={styles.inputGroup}>
                        <label style={styles.inputLabel}>Route Type</label>
                        <div style={styles.toggleRow}>
                            <button
                                style={{
                                    ...styles.toggleBtn,
                                    ...(isLoop ? styles.toggleBtnActive : {})
                                }}
                                onClick={() => setIsLoop(true)}
                            >
                                Loop
                            </button>
                            <button
                                style={{
                                    ...styles.toggleBtn,
                                    ...(!isLoop ? styles.toggleBtnActive : {})
                                }}
                                onClick={() => setIsLoop(false)}
                            >
                                Point-to-Point
                            </button>
                        </div>
                    </div>

                    {/* End Location (only for point-to-point) */}
                    {!isLoop && (
                        <div style={styles.inputGroup}>
                            <label style={styles.inputLabel}>End Location</label>
                            <div style={styles.toggleRow}>
                                <button
                                    style={{
                                        ...styles.toggleBtn,
                                        ...(useMapCenterEnd ? styles.toggleBtnActive : {})
                                    }}
                                    onClick={() => {
                                        setUseMapCenterEnd(true);
                                        setPinTarget(null);
                                    }}
                                >
                                    Map Center
                                </button>
                                <button
                                    style={{
                                        ...styles.toggleBtn,
                                        ...(!useMapCenterEnd ? styles.toggleBtnActive : {})
                                    }}
                                    onClick={() => {
                                        setUseMapCenterEnd(false);
                                        setPinTarget(null);
                                    }}
                                >
                                    Custom
                                </button>
                                <button
                                    style={{
                                        ...styles.toggleBtn,
                                        ...styles.pinBtn,
                                        ...(pinTarget === 'end' ? styles.pinBtnActive : {})
                                    }}
                                    onClick={() => {
                                        setPinTarget(pinTarget === 'end' ? null : 'end');
                                        setUseMapCenterEnd(false);
                                    }}
                                >
                                    📍 {pinTarget === 'end' ? 'Click Map...' : 'Drop Pin'}
                                </button>
                            </div>
                            {!useMapCenterEnd && (
                                <input
                                    type="text"
                                    style={{ ...styles.input, marginTop: 8 }}
                                    value={endCoords}
                                    onChange={(e) => setEndCoords(e.target.value)}
                                    placeholder="lat, lon (e.g., 47.670, -122.380)"
                                />
                            )}
                            {useMapCenterEnd && (
                                <div style={styles.coordDisplay}>
                                    {center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Target Distance */}
                    <div style={styles.inputGroup}>
                        <label style={styles.inputLabel}>Target Distance (miles)</label>
                        <input
                            type="number"
                            style={styles.input}
                            value={routeDistance}
                            onChange={(e) => setRouteDistance(e.target.value)}
                            min="0.5"
                            max="50"
                            step="0.5"
                        />
                    </div>

                    <button
                        style={{
                            ...styles.planBtn,
                            ...(isPlanning ? styles.planBtnDisabled : {})
                        }}
                        onClick={handlePlanRoute}
                        disabled={isPlanning}
                    >
                        {isPlanning ? 'Planning...' : 'Generate Route'}
                    </button>

                    {routeError && (
                        <div style={styles.errorBox}>
                            {routeError}
                        </div>
                    )}

                    {routeStats && (
                        <div style={styles.routeStats}>
                            <div style={styles.statTitle}>Route Generated!</div>
                            <div style={styles.statRow}>
                                <span>Distance:</span>
                                <span>{routeStats.distanceMiles.toFixed(2)} mi</span>
                            </div>
                            <div style={styles.statRow}>
                                <span>Unrun:</span>
                                <span style={{ color: palette.accent }}>
                                    {routeStats.unrunDistanceMiles.toFixed(2)} mi ({routeStats.unrunPercentage.toFixed(0)}%)
                                </span>
                            </div>
                            <div style={styles.statRow}>
                                <span>Unique Streets:</span>
                                <span>{routeStats.uniqueStreetCount}</span>
                            </div>
                            <div style={styles.statRow}>
                                <span>Repeated:</span>
                                <span style={{ color: routeStats.repeatedSegments > 0 ? palette.warning : palette.success }}>
                                    {routeStats.repeatedSegments} segment{routeStats.repeatedSegments !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div style={styles.progressBar}>
                                <div 
                                    style={{
                                        ...styles.progressFill,
                                        width: `${Math.min(100, routeStats.unrunPercentage)}%`
                                    }}
                                />
                            </div>
                            <div style={styles.buttonRow}>
                                <button
                                    style={styles.clearBtn}
                                    onClick={clearPlannedRoute}
                                >
                                    Clear Route
                                </button>
                                <button
                                    style={styles.detailsBtn}
                                    onClick={() => setShowRouteDetails(true)}
                                >
                                    Route Details
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Route Details Panel */}
            {showRouteDetails && plannedRoute && (
                <div style={isMobile ? styles.routeDetailsPanelMobile : styles.routeDetailsPanel}>
                    {isMobile && <div style={styles.bottomSheetHandle} />}
                    <div style={styles.routeDetailsPanelHeader}>
                        <span style={styles.routePlannerTitle}>Route Directions</span>
                        <button 
                            style={styles.closeBtn}
                            onClick={() => setShowRouteDetails(false)}
                        >
                            ✕
                        </button>
                    </div>
                    <div style={styles.directionsScroll}>
                        {getRouteDirections(plannedRoute).map((dir) => (
                            <div key={dir.step} style={styles.directionStep}>
                                <div style={styles.directionStepNumber}>{dir.step}</div>
                                <div style={styles.directionContent}>
                                    <div style={styles.directionStreet}>
                                        {dir.streetName}
                                        {dir.isUnrun && <span style={styles.unrunBadge}>NEW</span>}
                                    </div>
                                    <div style={styles.directionDistance}>
                                        {dir.distanceMiles.toFixed(2)} mi • Total: {dir.cumulativeDistanceMiles.toFixed(2)} mi
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
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
    // Route Planner Styles
    routePlannerButton: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        fontSize: 14,
        padding: '10px 16px',
        zIndex: 9998,
        background: palette.route || '#f97316',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        boxShadow: palette.shadow,
        cursor: 'pointer',
        fontWeight: 'bold',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
    },
    routePlannerPanel: {
        position: 'absolute',
        bottom: 70,
        right: 20,
        width: 300,
        background: palette.panel,
        padding: 16,
        borderRadius: 12,
        boxShadow: palette.shadow,
        zIndex: 9999,
        color: palette.text,
        border: `1px solid ${palette.panelBorder}`,
        backdropFilter: 'blur(6px)',
    },
    routePlannerHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    routePlannerTitle: {
        fontWeight: 'bold',
        fontSize: 18,
        color: palette.text,
    },
    closeBtn: {
        background: 'transparent',
        border: 'none',
        color: palette.muted,
        fontSize: 18,
        cursor: 'pointer',
        padding: 4,
    },
    routePlannerDesc: {
        fontSize: 13,
        color: palette.muted,
        marginBottom: 16,
        marginTop: 0,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        display: 'block',
        fontSize: 13,
        color: palette.muted,
        marginBottom: 6,
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${palette.panelBorder}`,
        background: palette.overlay,
        color: palette.text,
        fontSize: 14,
        boxSizing: 'border-box',
    },
    coordDisplay: {
        marginTop: 8,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(56, 189, 248, 0.1)',
        color: palette.accent,
        fontSize: 13,
        fontFamily: 'monospace',
    },
    toggleRow: {
        display: 'flex',
        gap: 8,
    },
    toggleBtn: {
        flex: 1,
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${palette.panelBorder}`,
        background: 'transparent',
        color: palette.muted,
        fontSize: 13,
        cursor: 'pointer',
        transition: 'all 150ms ease',
    },
    toggleBtnActive: {
        background: palette.accent,
        border: `1px solid ${palette.accent}`,
        color: '#0b1224',
        fontWeight: 'bold',
    },
    pinBtn: {
        flex: 'none',
        padding: '8px 10px',
    },
    pinBtnActive: {
        background: '#ef4444',
        border: '1px solid #ef4444',
        color: '#fff',
        fontWeight: 'bold',
    },
    planBtn: {
        width: '100%',
        padding: '12px 16px',
        borderRadius: 8,
        border: 'none',
        background: palette.route || '#f97316',
        color: '#fff',
        fontSize: 15,
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'opacity 150ms ease',
    },
    planBtnDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed',
    },
    errorBox: {
        marginTop: 12,
        padding: 10,
        borderRadius: 8,
        background: 'rgba(239, 68, 68, 0.2)',
        color: '#ff6b6b',
        fontSize: 13,
    },
    routeStats: {
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        background: 'rgba(56, 189, 248, 0.1)',
        border: `1px solid ${palette.accent}`,
    },
    statTitle: {
        fontWeight: 'bold',
        color: palette.accent,
        marginBottom: 10,
        fontSize: 15,
    },
    statRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 13,
        color: palette.text,
        marginBottom: 6,
    },
    progressBar: {
        height: 6,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        marginTop: 8,
        marginBottom: 12,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        background: palette.accent,
        borderRadius: 3,
        transition: 'width 300ms ease',
    },
    clearBtn: {
        flex: 1,
        padding: '8px 12px',
        borderRadius: 6,
        border: `1px solid ${palette.panelBorder}`,
        background: 'transparent',
        color: palette.muted,
        fontSize: 13,
        cursor: 'pointer',
        transition: 'all 150ms ease',
    },
    buttonRow: {
        display: 'flex',
        gap: 8,
    },
    detailsBtn: {
        flex: 1,
        padding: '8px 12px',
        borderRadius: 6,
        border: `1px solid ${palette.accent}`,
        background: 'rgba(56, 189, 248, 0.1)',
        color: palette.accent,
        fontSize: 13,
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'all 150ms ease',
    },
    routeDetailsPanel: {
        position: 'absolute',
        top: 70,
        left: 20,
        width: 320,
        maxHeight: 'calc(100vh - 120px)',
        background: palette.panel,
        borderRadius: 12,
        boxShadow: palette.shadow,
        zIndex: 9999,
        color: palette.text,
        border: `1px solid ${palette.panelBorder}`,
        backdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
    },
    routeDetailsPanelHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottom: `1px solid ${palette.panelBorder}`,
    },
    directionsScroll: {
        flex: 1,
        overflowY: 'auto',
        padding: '8px 16px 16px',
    },
    directionStep: {
        display: 'flex',
        gap: 12,
        padding: '10px 0',
        borderBottom: `1px solid ${palette.panelBorder}`,
    },
    directionStepNumber: {
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: palette.accent,
        color: '#0b1224',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 'bold',
        flexShrink: 0,
    },
    directionContent: {
        flex: 1,
    },
    directionStreet: {
        fontSize: 14,
        fontWeight: 'bold',
        color: palette.text,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    unrunBadge: {
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 4,
        background: palette.accent,
        color: '#0b1224',
        fontWeight: 'bold',
    },
    directionDistance: {
        fontSize: 12,
        color: palette.muted,
        marginTop: 4,
    },
    // Pin Placement Styles
    pinButton: {
        position: 'absolute',
        bottom: 70,
        right: 20,
        fontSize: 14,
        padding: '10px 16px',
        zIndex: 9997,
        background: palette.panel,
        color: palette.text,
        border: `1px solid ${palette.panelBorder}`,
        borderRadius: 10,
        boxShadow: palette.shadow,
        cursor: 'pointer',
        fontWeight: 'bold',
        transition: 'all 120ms ease',
    },
    pinButtonActive: {
        background: '#ef4444',
        borderColor: '#ef4444',
        color: '#fff',
    },
    pinPanel: {
        position: 'absolute',
        bottom: 120,
        right: 20,
        width: 280,
        background: palette.panel,
        padding: 16,
        borderRadius: 12,
        boxShadow: palette.shadow,
        zIndex: 9999,
        color: palette.text,
        border: `1px solid ${palette.panelBorder}`,
        backdropFilter: 'blur(6px)',
    },
    pinPanelHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${palette.panelBorder}`,
    },
    pinPanelTitle: {
        fontWeight: 'bold',
        fontSize: 15,
        color: palette.text,
    },
    addressDisplay: {
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(255, 255, 255, 0.05)',
        color: palette.text,
        fontSize: 13,
        lineHeight: 1.4,
        wordBreak: 'break-word',
    },
    copyBtn: {
        marginTop: 8,
        padding: '6px 12px',
        borderRadius: 6,
        border: `1px solid ${palette.panelBorder}`,
        background: 'transparent',
        color: palette.muted,
        fontSize: 12,
        cursor: 'pointer',
        transition: 'all 150ms ease',
    },
    pinActions: {
        display: 'flex',
        gap: 8,
        marginTop: 12,
    },
    pinActionBtn: {
        flex: 1,
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${palette.accent}`,
        background: 'rgba(56, 189, 248, 0.1)',
        color: palette.accent,
        fontSize: 13,
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'all 150ms ease',
    },
    
    // ==========================================
    // MOBILE-SPECIFIC STYLES
    // ==========================================
    
    sidebarMobile: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '70vh',
        background: palette.panel,
        padding: 16,
        paddingBottom: 30,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        zIndex: 10000,
        color: palette.text,
        border: `1px solid ${palette.panelBorder}`,
        borderBottom: 'none',
        overflowY: 'auto',
    },
    sidebarHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    routePlannerButtonMobile: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        fontSize: 20,
        padding: '14px 16px',
        zIndex: 9998,
        background: palette.route || '#f97316',
        color: '#fff',
        border: 'none',
        borderRadius: 50,
        boxShadow: '0 4px 20px rgba(249, 115, 22, 0.4)',
        cursor: 'pointer',
        fontWeight: 'bold',
    },
    routePlannerPanelMobile: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '75vh',
        background: palette.panel,
        padding: 16,
        paddingTop: 8,
        paddingBottom: 30,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        zIndex: 10000,
        color: palette.text,
        border: `1px solid ${palette.panelBorder}`,
        borderBottom: 'none',
        overflowY: 'auto',
    },
    bottomSheetHandle: {
        width: 40,
        height: 4,
        background: palette.muted,
        borderRadius: 2,
        margin: '0 auto 12px',
    },
    pinModeIndicator: {
        position: 'absolute',
        top: 60,
        left: 10,
        right: 10,
        background: '#ef4444',
        padding: '12px 16px',
        borderRadius: 10,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10000,
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    pinModeCancel: {
        background: 'transparent',
        border: 'none',
        color: '#fff',
        fontWeight: 'bold',
        textDecoration: 'underline',
        cursor: 'pointer',
        fontSize: 14,
    },
    routeDetailsPanelMobile: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '80vh',
        background: palette.panel,
        padding: 16,
        paddingTop: 8,
        paddingBottom: 30,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        zIndex: 10000,
        color: palette.text,
        border: `1px solid ${palette.panelBorder}`,
        borderBottom: 'none',
        display: 'flex',
        flexDirection: 'column',
    },
    mobileRouteStatsBar: {
        position: 'absolute',
        bottom: 90,
        left: 10,
        right: 10,
        background: palette.panel,
        borderRadius: 12,
        padding: '10px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 9997,
        border: `1px solid ${palette.panelBorder}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    },
    mobileRouteStatsText: {
        color: palette.accent,
        fontWeight: 'bold',
        fontSize: 14,
    },
    mobileRouteStatsButtons: {
        display: 'flex',
        gap: 8,
    },
    mobileRouteStatsBtn: {
        background: 'rgba(56, 189, 248, 0.2)',
        border: 'none',
        padding: '6px 12px',
        borderRadius: 6,
        color: palette.text,
        fontWeight: 'bold',
        fontSize: 12,
        cursor: 'pointer',
    },
    mobileRouteStatsBtnClear: {
        background: 'rgba(239, 68, 68, 0.2)',
    },
};
