import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, FlatList, TouchableOpacity, Modal } from 'react-native';
import { useAppState } from '../state/StateContext';

export default function MapScreen({ navigation }: any) {
    const { streets, center, toggleStreet, activities } = useAppState();
    const [showCompleted, setShowCompleted] = useState(true);
    const [showUnrun, setShowUnrun] = useState(true);

    // Generate simple synthetic polylines for each street for MVP.
    const streetPolylines = useMemo(() => {
        return streets.map((s, idx) => {
            const baseLat = (center.latitude || 37.78825) + (idx * 0.001 - 0.005);
            const baseLng = (center.longitude || -122.4324) + (idx * 0.001 - 0.005);
            const coords = [
                { latitude: baseLat, longitude: baseLng },
                { latitude: baseLat + 0.0008, longitude: baseLng + 0.0012 },
            ];
            return { id: s.id, name: s.name, completed: s.completed, coords };
        });
    }, [streets, center.latitude, center.longitude]);

    const visible = streetPolylines.filter(sp => (sp.completed ? showCompleted : showUnrun));

    // Settings handled via top-level Settings screen; no inline settings here on web.

    return (
        <View style={styles.container}>
            {/* Header provided by app-level navigation; settings accessible via top-right button. */}
            <View style={styles.mapPlaceholder}>
                <Text style={styles.mapText}>
                    Map view: {visible.length} streets + {activities.length} activities
                </Text>
                <Text style={styles.centerText}>
                    Center: {center.name} ({center.latitude.toFixed(4)}, {center.longitude.toFixed(4)})
                </Text>
            </View>

            <View style={styles.controls}>
                    <Text style={styles.title}>Streets</Text>
                    <View style={styles.row}>
                        <Text>Show completed</Text>
                        <Switch value={showCompleted} onValueChange={setShowCompleted} />
                    </View>
                    <View style={styles.row}>
                        <Text>Show unrun</Text>
                        <Switch value={showUnrun} onValueChange={setShowUnrun} />
                    </View>

                    <FlatList
                        data={visible}
                        keyExtractor={i => i.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity onPress={() => toggleStreet(item.id)} style={styles.item}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <View style={{ width: 12, height: 12, backgroundColor: item.completed ? 'green' : 'red', borderRadius: 2 }} />
                                    <Text style={{ textDecorationLine: item.completed ? 'line-through' : 'none', flex: 1 }}>{item.name}</Text>
                                </View>
                                <Text>{item.completed ? '✓' : ''}</Text>
                            </TouchableOpacity>
                        )}
                    />
                    {activities.length > 0 && (
                        <>
                            <Text style={{ fontWeight: '600', marginTop: 8, marginBottom: 4 }}>Strava Activities</Text>
                            <FlatList
                                data={activities}
                                scrollEnabled={false}
                                keyExtractor={i => String(i.id)}
                                renderItem={({ item }) => (
                                    <View style={{ ...styles.item, backgroundColor: '#e3f2fd' }}>
                                        <Text style={{ fontWeight: '500' }}>{item.name}</Text>
                                        <Text style={{ fontSize: 11, color: '#666' }}>
                                            {item.type} · {(item.distance / 1000).toFixed(1)} km
                                        </Text>
                                    </View>
                                )}
                            />
                        </>
                    )}
                </View>
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
