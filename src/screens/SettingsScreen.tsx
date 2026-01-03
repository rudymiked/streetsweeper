import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, TextInput, Alert } from 'react-native';
import * as Location from 'expo-location';
import { useAppState } from '../state/StateContext';

export default function SettingsScreen() {
  const { center, setCenter } = useAppState();
  const [addressInput, setAddressInput] = useState('');

  async function useCurrentLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setCenter({ name: 'Current Location', latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      Alert.alert('Success', 'Center updated to your current location');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not get location');
    }
  }

  async function useAddress() {
    if (!addressInput.trim()) {
      Alert.alert('Empty address', 'Please enter an address');
      return;
    }
    try {
      const results = await Location.geocodeAsync(addressInput);
      if (results.length === 0) {
        Alert.alert('Not found', 'Address could not be geocoded');
        return;
      }
      const { latitude, longitude } = results[0];
      setCenter({ name: addressInput, latitude, longitude });
      setAddressInput('');
      Alert.alert('Success', 'Center updated to ' + addressInput);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not geocode address');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={{ marginVertical: 8 }}>Current Center: {center.name}</Text>
      <Button title="Use Current Location" onPress={useCurrentLocation} />
      <View style={{ height: 12 }} />
      <Text>Or enter an address:</Text>
      <TextInput style={styles.input} placeholder="Enter address" value={addressInput} onChangeText={setAddressInput} />
      <Button title="Set as Center" onPress={useAddress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: 'white' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 6, marginVertical: 8 },
});
