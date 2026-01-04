import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, FlatList, TouchableOpacity, Modal } from 'react-native';
import { useAppState } from '../state/StateContext';
import WebMapView from './WebMapView';

export default function MapScreen({ navigation }: any) {
    const { streets, center, toggleStreet, activities, showCompleted, setShowCompleted, showUnrun, setShowUnrun } = useAppState();

    // Generate simple synthetic polylines for each street for MVP.
    const streetPolylines = useMemo(() => {
        return streets.map((s, idx) => {
            const baseLat = (center.latitude || Number.parseFloat(process.env.DEFAULT_MAP_CENTER_LATITUDE!)) + (idx * 0.001 - 0.005);
            const baseLng = (center.longitude || Number.parseFloat(process.env.DEFAULT_MAP_CENTER_LONGITUDE!)) + (idx * 0.001 - 0.005);
            const coords = [
                { latitude: baseLat, longitude: baseLng },
                { latitude: baseLat + 0.0008, longitude: baseLng + 0.0012 },
            ];
            return { id: s.id, name: s.name, completed: s.completed, coords };
        });
    }, [streets, center.latitude, center.longitude]);

    const visible = streetPolylines.filter(sp => (sp.completed ? showCompleted : showUnrun));

    // Decode activity polylines (same algorithm as native map screen)
    function decodePolyline(polylineStr: string) {
        const coords: any[] = [];
        let index = 0;
        let lat = 0;
        let lng = 0;

        while (index < polylineStr.length) {
            let result = 0;
            let shift = 0;
            let byte = 0;

            do {
                byte = polylineStr.charCodeAt(index) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
                index += 1;
            } while (byte >= 0x20);

            lat += (result & 1) ? ~(result >> 1) : result >> 1;

            result = 0;
            shift = 0;
            do {
                byte = polylineStr.charCodeAt(index) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
                index += 1;
            } while (byte >= 0x20);

            lng += (result & 1) ? ~(result >> 1) : result >> 1;

            coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
        }

        return coords;
    }

    const activityPolylines = activities
        .filter((a: any) => a.polyline)
        .map((a: any) => ({ id: a.id, name: a.name, coords: decodePolyline(a.polyline || '') }));

    // Settings handled via top-level Settings screen; no inline settings here on web.

    return (
        <View style={styles.container}>
            {/* Header provided by app-level navigation; settings accessible via top-right button. */}
            <View style={styles.mapPlaceholder}>
                <WebMapView center={center} streets={visible} activities={activityPolylines} />
            </View>

            {/* Controls moved into Settings screen; hidden on main map UI. */}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    mapPlaceholder: { flex: 1, backgroundColor: '#e8f4f8', justifyContent: 'center', alignItems: 'center', padding: 16 },
    mapText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
    centerText: { fontSize: 12, marginTop: 8, textAlign: 'center', color: '#666' },
    controls: { position: 'absolute', top: 12, left: 12, right: 12, maxHeight: '40%', backgroundColor: 'rgba(255,255,255,0.95)', padding: 12, borderRadius: 8 },
    title: { fontSize: 16, fontWeight: '700' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    item: { paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
    input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginVertical: 8 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
});
