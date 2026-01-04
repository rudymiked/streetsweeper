import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, TextInput, Alert, Platform, Switch } from 'react-native';
import { useAppState } from '../state/StateContext';

// Only import expo-location on native platforms
let Location: any = null;
const isWeb = typeof Platform === 'undefined' || Platform?.OS === 'web';
if (!isWeb) {
  Location = require('expo-location');
}

export default function SettingsScreen() {
  const { center, setCenter, showCompleted, setShowCompleted, showUnrun, setShowUnrun } = useAppState();
  const [addressInput, setAddressInput] = useState('');

  async function useCurrentLocation() {
    try {
      if (isWeb) {
        // Use browser Geolocation API on web
        if (!navigator.geolocation) {
          Alert.alert('Geolocation not supported', 'Your browser does not support geolocation');
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setCenter({ name: 'Current Location', latitude, longitude });
            Alert.alert('Success', 'Center updated to your current location');
          },
          (error) => {
            Alert.alert('Error', error.message || 'Could not get location');
          }
        );
      } else {
        // Use expo-location on native
        if (!Location) throw new Error('expo-location not available');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission denied', 'Location permission is required');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        setCenter({ name: 'Current Location', latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        Alert.alert('Success', 'Center updated to your current location');
      }
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
      if (isWeb) {
        // Use web geocoding service (OpenStreetMap Nominatim - free, no API key needed)
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressInput)}`
        );
        const results = await response.json();
        if (!results || results.length === 0) {
          Alert.alert('Not found', 'Address could not be geocoded');
          return;
        }
        const { lat, lon } = results[0];
        setCenter({ name: addressInput, latitude: parseFloat(lat), longitude: parseFloat(lon) });
        setAddressInput('');
        Alert.alert('Success', 'Center updated to ' + addressInput);
      } else {
        // Use expo-location on native
        if (!Location) throw new Error('expo-location not available');
        const results = await Location.geocodeAsync(addressInput);
        if (results.length === 0) {
          Alert.alert('Not found', 'Address could not be geocoded');
          return;
        }
        const { latitude, longitude } = results[0];
        setCenter({ name: addressInput, latitude, longitude });
        setAddressInput('');
        Alert.alert('Success', 'Center updated to ' + addressInput);
      }
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

      <View style={{ height: 18 }} />
      <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Streets</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text>Show completed</Text>
        <Switch value={showCompleted} onValueChange={setShowCompleted} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text>Show unrun</Text>
        <Switch value={showUnrun} onValueChange={setShowUnrun} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: 'white' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 6, marginVertical: 8 },
});
