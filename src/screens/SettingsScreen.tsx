import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, TextInput, Alert, Platform, ActivityIndicator, TouchableOpacity } from 'react-native';
import { StravaActivity, useAppState } from '../state/StateContext';
import Constants from 'expo-constants';
import { IconButton } from 'react-native-paper';

// Only import expo-location on native platforms
let Location: any = null;
const isWeb = typeof Platform === 'undefined' || Platform?.OS === 'web';
if (!isWeb) {
  Location = require('expo-location');
}

export default function SettingsScreen({ closePanel }: { closePanel: () => void }) {
  const { center, setCenter, showCompleted, setShowCompleted, showUnrun, setShowUnrun, loadStreetsFromOSM, activities, markStreetsRunByActivities, radiusMiles, setActivities, loadStreetsFromStravaActivities, setRadiusMiles } = useAppState();
  const [loadingOSM, setLoadingOSM] = useState(false);
  const [loadingStrava, setLoadingStrava] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
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

  async function loadAndMatchStreets(center: any, radiusMiles: number, activities: any[]) {
    setStatusMessage('Loading streets from OSM...');
    await loadStreetsFromOSM(center, radiusMiles);

    setStatusMessage('Matching activities to streets...');
    markStreetsRunByActivities(activities);
  }

  async function loadStravaActivities(accessToken: string): Promise<StravaActivity[]> {
    setStatusMessage('Loading activities...');

    const all: any[] = [];
    let page = 1;
    const perPage = 200;

    while (true) {
      const url = `${process.env.EXPO_PUBLIC_STRAVA_API_BASE_URL}/athlete/activities?per_page=${perPage}&page=${page}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load activities (page ${page})`);
      }

      const batch = await res.json();

      // No more activities → stop
      if (!batch || batch.length === 0) break;

      all.push(...batch);
      page += 1;
    }

    return all;
  }

  async function getStravaAuthCode(
    clientId: number,
    clientSecret: string,
    scopes: string
  ): Promise<string> {
    const redirectUriWeb = `${window.location.origin}${window.location.pathname}`;

    if (isWeb) {
      const authUrl =
        `${process.env.EXPO_PUBLIC_STRAVA_AUTHORIZE_URL}` +
        `?client_id=${clientId}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUriWeb)}` +
        `&approval_prompt=auto` +
        `&scope=${encodeURIComponent(scopes)}`;

      const popup = window.open(authUrl, 'strava_auth', 'width=600,height=700');
      if (!popup) throw new Error('Popup blocked');

      return await new Promise((resolve, reject) => {
        const timeout = 60000;
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
            const code = params.get('code');
            if (code) {
              clearInterval(id);
              popup.close();
              resolve(code);
            }
          } catch {
            // Cross-origin until Strava redirects back — ignore
          }

          elapsed += interval;
          if (elapsed >= timeout) {
            clearInterval(id);
            popup.close();
            reject(new Error('Authorization timed out'));
          }
        }, interval);
      });
    }

    // Native (iOS/Android)
    const AuthSession: any = require('expo-auth-session');
    const WebBrowser: any = require('expo-web-browser');

    const redirectUri = AuthSession.makeRedirectUri({ preferLocalhost: true });

    const authUrl =
      `${process.env.EXPO_PUBLIC_STRAVA_AUTHORIZE_URL}` +
      `?client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&approval_prompt=auto` +
      `&scope=${encodeURIComponent(scopes)}`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    if (!result || result.type !== 'success') {
      throw new Error('Auth cancelled');
    }

    const params = new URL(result.url).searchParams;
    const code = params.get('code');

    if (!code) throw new Error('No auth code returned');

    return code;
  }

  async function exchangeStravaToken(
    code: string,
    clientId: number,
    clientSecret: string
  ): Promise<string> {
    const res = await fetch(`${process.env.EXPO_PUBLIC_STRAVA_AUTHORIZE_TOKEN_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.access_token) {
      throw new Error('Token exchange failed');
    }

    return json.access_token;
  }

  async function loadStreetsOnly() {
    setLoadingOSM(true);
    setStatusMessage('Loading streets from OSM...');
    try {
      await loadAndMatchStreets(center, radiusMiles || 2, []);
      setStatusMessage('Done');
      Alert.alert('Done', 'Loaded streets from OpenStreetMap');
    }
    catch (err: any) {
      Alert.alert('Error', err.message || 'Could not load streets');
      setStatusMessage(err.message || 'Error');
    }
    finally {
      setLoadingOSM(false);
    }
  }

  async function loadStrava(): Promise<any> {
    setLoadingStrava(true);
    setStatusMessage('Connecting to Strava...');
    try {
      const expoExtra = (Constants.expoConfig && Constants.expoConfig.extra) || {};
      const STRAVA_CLIENT_ID = Number(expoExtra.STRAVA_CLIENT_ID) || 0;
      const STRAVA_CLIENT_SECRET = expoExtra.STRAVA_CLIENT_SECRET || '';
      const STRAVA_SCOPES = 'activity:read_all';
      if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
        Alert.alert('Missing Strava settings', 'Please set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in app config');
        setStatusMessage('Missing Strava settings');
        return;
      }
      const code = await getStravaAuthCode(STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_SCOPES);
      if (!code) throw new Error('No auth code received');
      setStatusMessage('Exchanging token...');
      const accessToken: string = await exchangeStravaToken(code, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET);
      const activitiesForState = await loadStravaActivities(accessToken);
      setActivities(activitiesForState);

      console.log('Loaded activities legnth:', activitiesForState.length);

      await loadStreetsFromStravaActivities(activitiesForState);
      setStatusMessage('Done');
      Alert.alert('Done', 'Loaded activities from Strava');

      return activitiesForState;
    }
    catch (err: any) {
      Alert.alert('Error', err.message || 'Could not load activities');
      setStatusMessage(err.message || 'Error');
    }
    finally {
      setLoadingStrava(false);
    }
  }

  // One-click: connect to Strava, load activities, load OSM streets, apply matching
  async function connectLoadAll() {
    try {
      const activitiesForState = await loadStrava();

      await loadAndMatchStreets(center, radiusMiles || 2, activitiesForState);

      setStatusMessage('Done');
      Alert.alert('Complete', 'Activities and streets loaded and matched');
    } catch (err: any) {
      console.error('connectLoadAll error', err);
      Alert.alert('Error', err.message || 'Operation failed');
      setStatusMessage(err.message || 'Error');
    } finally {
      setLoadingAll(false);
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

      <Button color={'#FC4C02'} title={loadingAll ? 'Working...' : 'Connect to Strava & Populate Streets'} onPress={connectLoadAll} />

      <Button title={loadingOSM ? 'Working...' : 'Only Load Streets'} onPress={loadStreetsOnly} />
      <View style={{ height: 12 }} />
      <Button title={loadingStrava ? 'Working...' : 'Connect to and Load Strava'} onPress={loadStrava} />
      {statusMessage && (
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
          {statusMessage !== 'Done' && (loadingOSM || loadingStrava || loadingAll) && <ActivityIndicator style={{ marginRight: 8 }} />}
          <Text>{statusMessage}</Text>
        </View>
      )}
      <View style={{ height: 12 }} />
      <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 12, }} />
      <View style={{ height: 12 }} />

      <Text style={styles.title}>Radius: {radiusMiles.toFixed(1)} mi</Text>
      <View style={styles.container}>
        <TouchableOpacity onPress={() => setRadiusMiles(Math.max(0.5, +(radiusMiles - 0.5).toFixed(1)))} style={styles.input}>
          <Text>-</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setRadiusMiles(Math.min(5, +(radiusMiles + 0.5).toFixed(1)))} style={styles.input}>
          <Text>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: 'white' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 6, marginVertical: 8 },
});
