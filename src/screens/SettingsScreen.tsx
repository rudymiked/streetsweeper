import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, TextInput, Alert, Platform, Switch, ActivityIndicator } from 'react-native';
import { useAppState } from '../state/StateContext';
import Constants from 'expo-constants';
import { IconButton } from 'react-native-paper';

// Only import expo-location on native platforms
let Location: any = null;
const isWeb = typeof Platform === 'undefined' || Platform?.OS === 'web';
if (!isWeb) {
  Location = require('expo-location');
}

export default function SettingsScreen({ closePanel }: { closePanel: () => void }) {
  const { center, setCenter, showCompleted, setShowCompleted, showUnrun, setShowUnrun, loadStreetsFromOSM, activities, markStreetsRunByActivities, radiusMiles, setActivities } = useAppState();
  const [loadingOSM, setLoadingOSM] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  // One-click: connect to Strava, load activities, load OSM streets, apply matching
  async function connectLoadAll() {
    const expoExtra = (Constants.expoConfig && Constants.expoConfig.extra) || {};
    const STRAVA_CLIENT_ID = Number(expoExtra.STRAVA_CLIENT_ID) || 0;
    const STRAVA_CLIENT_SECRET = expoExtra.STRAVA_CLIENT_SECRET || '';
    const STRAVA_SCOPES = 'activity:read_all';

    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
      Alert.alert('Missing Strava settings', 'Please set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in app config');
      return;
    }

    setLoadingOSM(true);
    setStatusMessage('Connecting to Strava...');

    try {
      let code: string | null = null;

      if (isWeb) {
        // Open popup to perform OAuth, then poll for redirect with code
        const redirectUri = `${window.location.origin}${window.location.pathname}`;
        const authUrl =
          `https://www.strava.com/oauth/authorize` +
          `?client_id=${STRAVA_CLIENT_ID}` +
          `&response_type=code` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&approval_prompt=auto` +
          `&scope=${encodeURIComponent(STRAVA_SCOPES)}`;

        const popup = window.open(authUrl, 'strava_auth', 'width=600,height=700');
        if (!popup) throw new Error('Popup blocked');

        // Poll for redirect back to our origin
        setStatusMessage('Waiting for Strava authorization...');
        code = await new Promise((resolve, reject) => {
          const timeout = 60000; // 60s
          const interval = 500;
          let elapsed = 0;
          const id = setInterval(() => {
            if (!popup || popup.closed) {
              clearInterval(id);
              reject(new Error('Popup closed before authorization'));
              return;
            }
            try {
              const params = new URLSearchParams(popup.location.search);
              const c = params.get('code');
              if (c) {
                clearInterval(id);
                popup.close();
                resolve(c);
              }
            } catch (e) {
              // cross-origin until redirected back; ignore
            }
            elapsed += interval;
            if (elapsed >= timeout) {
              clearInterval(id);
              popup.close();
              reject(new Error('Authorization timed out'));
            }
          }, interval);
        });
      } else {
        // Native flow using expo-auth-session / WebBrowser
        const AuthSession: any = require('expo-auth-session');
        const WebBrowser: any = require('expo-web-browser');
        const redirectUri = AuthSession.makeRedirectUri({ preferLocalhost: true });
        const authUrl =
          `https://www.strava.com/oauth/authorize` +
          `?client_id=${STRAVA_CLIENT_ID}` +
          `&response_type=code` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&approval_prompt=auto` +
          `&scope=${encodeURIComponent(STRAVA_SCOPES)}`;

        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
        if (!result || result.type !== 'success') throw new Error('Auth cancelled');
        const returnedUrl = result.url;
        const params = new URL(returnedUrl).searchParams;
        code = params.get('code');
      }

      if (!code) throw new Error('No auth code received');

      setStatusMessage('Exchanging token...');
      // Exchange code for access token
      const tokenRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
        }),
      });

      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson.access_token) throw new Error('Token exchange failed');
      const accessToken = tokenJson.access_token;

      setStatusMessage('Loading activities...');
      // Fetch activities (single page for simplicity)
      const actRes = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=200', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!actRes.ok) throw new Error('Failed to load activities');
      const raw = await actRes.json();
      const activitiesForState = raw.map((act: any) => ({
        id: act.id,
        name: act.name,
        type: act.type,
        distance: act.distance,
        date: act.start_date,
        polyline: act.map?.summary_polyline || '',
      }));

      // Save activities to context
      setActivities(activitiesForState as any);

      setStatusMessage('Loading streets from OSM...');
      await loadStreetsFromOSM(center, radiusMiles || 2);

      setStatusMessage('Matching activities to streets...');
      markStreetsRunByActivities(activitiesForState as any);

      setStatusMessage('Done');
      Alert.alert('Complete', 'Activities and streets loaded and matched');
    } catch (err: any) {
      console.error('connectLoadAll error', err);
      Alert.alert('Error', err.message || 'Operation failed');
      setStatusMessage(err.message || 'Error');
    } finally {
      setLoadingOSM(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={{ alignItems: 'flex-end' }}>
        <IconButton icon="close" onPress={closePanel} />
      </View>
      <Text style={styles.title}>Settings</Text>
      <Text style={{ marginVertical: 8 }}>Current Center: {center.name}</Text>
      <Button title="Use Current Location" onPress={useCurrentLocation} />
      <View style={{ height: 12 }} />
      <Text>Or enter an address:</Text>
      <TextInput style={styles.input} placeholder="Enter address" value={addressInput} onChangeText={setAddressInput} />
      <Button title="Set as Center" onPress={useAddress} />
      <View style={{ height: 12 }} />
      <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 12, }} /> 
      <View style={{ height: 12 }} />
      {/* <Button
        title={loadingOSM ? 'Loading streets...' : 'Load Streets from OSM'}
        onPress={async () => {
          try {
            setLoadingOSM(true);
            await loadStreetsFromOSM(center, 2);
            Alert.alert('Done', 'Loaded streets from OpenStreetMap');
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Could not load streets');
          } finally {
            setLoadingOSM(false);
          }
        }}
      /> */}
      
      <Button color={'#FC4C02'} title={loadingOSM ? 'Working...' : 'Connect to Strava & Populate Streets'} onPress={connectLoadAll} />
      {statusMessage && (
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
          {statusMessage !== 'Done' && loadingOSM && <ActivityIndicator style={{ marginRight: 8 }} />}
          <Text>{statusMessage}</Text>
        </View>
      )}

      <View style={{ height: 12 }} />
      <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 12, }} />
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
