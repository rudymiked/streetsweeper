import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { StravaActivity, useAppState } from '../state/StateContext';
import Constants from 'expo-constants';
import { IconButton } from 'react-native-paper';
import { sleep } from '../utils/utils';

import osmMock from '../../assets/mock/osm.json';
import stravaMock from '../../assets/mock/strava.json';
import { getEnv } from '../utils/getEnv';

const extra = Constants.expoConfig?.extra ?? {};

let Location: any = null;
const isWeb = typeof Platform === 'undefined' || Platform?.OS === 'web';
if (!isWeb) {
  Location = require('expo-location');
}

export default function SettingsScreen({ closePanel }: { closePanel: () => void }) {
  const {
    center,
    setCenter,
    radiusMiles,
    setRadiusMiles,
    loadStreetsFromOSM,
    loadStreetsFromStravaActivities,
    loadAndMatchStreets,
    progress,
    progressMessage,
  } = useAppState();

  const [loading, setLoading] = useState({
    osm: false,
    strava: false,
    all: false,
  });

  const [addressInput, setAddressInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  function setLoadingFlag(key: keyof typeof loading, value: boolean) {
    setLoading(prev => ({ ...prev, [key]: value }));
  }

  async function useCurrentLocation() {
    try {
      if (isWeb) {
        if (!navigator.geolocation) {
          Alert.alert('Geolocation not supported', 'Your browser does not support geolocation');
          return;
        }
        navigator.geolocation.getCurrentPosition(
          pos => {
            setCenter({
              name: 'Current Location',
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            Alert.alert('Success', 'Center updated to your current location');
          },
          err => Alert.alert('Error', err.message || 'Could not get location')
        );
      } else {
        if (!Location) throw new Error('expo-location not available');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission denied', 'Location permission is required');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        setCenter({
          name: 'Current Location',
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
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
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressInput)}`
        );
        const results = await res.json();
        if (!results || results.length === 0) {
          Alert.alert('Not found', 'Address could not be geocoded');
          return;
        }
        const { lat, lon } = results[0];
        setCenter({
          name: addressInput,
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
        });
        setAddressInput('');
        Alert.alert('Success', 'Center updated to ' + addressInput);
      } else {
        if (!Location) throw new Error('expo-location not available');
        const results = await Location.geocodeAsync(addressInput);
        if (!results.length) {
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

  async function loadFromJson(useAI: boolean) {
    try {
      setStatusMessage('Loading mock data...');
      setLoadingFlag('all', true);

      const mockStreets = osmMock;
      const mockActivities: StravaActivity[] = stravaMock.map((act: any) => ({
        ...act,
        matchedStreets: [],
      }));

      // Load OSM streets into state
      await loadStreetsFromOSM(center, radiusMiles || 2, mockStreets);
      // Load Strava activities into state
      await loadStreetsFromStravaActivities(mockActivities);

      console.log("mockactivities", mockActivities.slice(3));
      console.log("mockStreets", mockStreets);
      // Run matching
      await loadAndMatchStreets(center, radiusMiles || 2, mockActivities, useAI, mockStreets);

      setStatusMessage('Done');
      Alert.alert('Complete', 'Loaded streets + Strava from JSON');
    } catch (err: any) {
      console.error(err);
      setStatusMessage(err.message || 'Error');
      Alert.alert('Error', err.message || 'Could not load JSON data');
    } finally {
      setLoadingFlag('all', false);
    }
  }

  async function loadStravaActivities(accessToken: string): Promise<StravaActivity[]> {
    setStatusMessage('Loading activities...');

    const all: any[] = [];
    let page = 1;
    const perPage = 200;

    while (true) {
      const url = `${getEnv("EXPO_PUBLIC_STRAVA_API_BASE_URL")}/athlete/activities?per_page=${perPage}&page=${page}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load activities (page ${page})`);
      }

      const batch = await res.json();
      if (!batch || batch.length === 0) break;

      all.push(...batch);
      page += 1;
    }

    console.log(`Loaded ${all.length} activities from Strava`);
    return all;
  }

  async function getStravaAuthCode(
    clientId: number,
    clientSecret: string,
    scopes: string
  ): Promise<string> {
    const AuthSession = require('expo-auth-session');
    const WebBrowser = require('expo-web-browser');

    if (Platform.OS === 'web') {
      const redirectUriWeb = AuthSession.makeRedirectUri({ preferLocalhost: true });

      const authUrl =
        `${getEnv("EXPO_PUBLIC_STRAVA_AUTHORIZE_URL")}` +
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
            // ignore cross-origin until redirect
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

    // Mobile (Android/iOS)

    const redirectUri = AuthSession.makeRedirectUri({ preferLocalhost: true });

    const authUrl =
      `${getEnv("EXPO_PUBLIC_STRAVA_AUTHORIZE_URL")}` +
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
    const res = await fetch(`${getEnv("EXPO_PUBLIC_STRAVA_AUTHORIZE_TOKEN_URL")}`, {
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
    setLoadingFlag('osm', true);
    setStatusMessage('Loading streets from OSM...');

    try {
      await loadStreetsFromOSM(center, radiusMiles || 2);
      setStatusMessage('Done');
      Alert.alert('Done', 'Loaded streets from OpenStreetMap');
    } catch (err: any) {
      setStatusMessage(err.message || 'Error');
      Alert.alert('Error', err.message || 'Could not load streets');
    } finally {
      setLoadingFlag('osm', false);
    }
  }

  async function loadStrava({ showLoading = true } = {}): Promise<StravaActivity[]> {
    if (showLoading) setLoadingFlag('strava', true);
    setStatusMessage('Connecting to Strava...');

    try {
      const STRAVA_CLIENT_ID = Number(getEnv("EXPO_PUBLIC_STRAVA_CLIENT_ID")) || 0;
      const STRAVA_CLIENT_SECRET = getEnv("EXPO_PUBLIC_STRAVA_CLIENT_SECRET") || '';
      const STRAVA_SCOPES = 'activity:read_all';

      if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
        setStatusMessage('Missing Strava settings');
        Alert.alert('Missing Strava settings');
        return [];
      }

      const code = await getStravaAuthCode(STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_SCOPES);
      if (!code) throw new Error('No auth code received');

      setStatusMessage('Exchanging token...');
      const accessToken = await exchangeStravaToken(code, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET);

      const rawActivities = await loadStravaActivities(accessToken);
      console.log(`Loaded ${rawActivities.length} activities from Strava`);

      setStatusMessage('Processing Strava activities...');
      await sleep(50);

      const enrichedActivities = await loadStreetsFromStravaActivities(rawActivities);

      setStatusMessage('Done');
      Alert.alert('Done', 'Loaded activities from Strava');

      return enrichedActivities;
    } catch (err: any) {
      setStatusMessage(err.message || 'Error');
      Alert.alert('Error', err.message || 'Could not load activities');
      return [];
    } finally {
      if (showLoading) setLoadingFlag('strava', false);
    }
  }

  async function connectLoadAll() {
    setLoadingFlag('all', true);
    setStatusMessage('Connecting to Strava...');

    try {
      const activitiesForState = await loadStrava({ showLoading: false });

      if (!activitiesForState.length) {
        throw new Error('No Strava activities loaded');
      }

      setStatusMessage('Loading OSM streets and matching...');
      await loadAndMatchStreets(center, radiusMiles || 2, activitiesForState, false);

      setStatusMessage('Done');
      Alert.alert('Complete', 'Activities and streets loaded and matched');
    } catch (err: any) {
      setStatusMessage(err.message || 'Error');
      Alert.alert('Error', err.message || 'Operation failed');
    } finally {
      setLoadingFlag('all', false);
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
      <TextInput
        style={styles.input}
        placeholder="Enter address"
        value={addressInput}
        onChangeText={setAddressInput}
      />
      <Button title="Set as Center" onPress={useAddress} />

      <View style={{ height: 12 }} />
      <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 12 }} />
      <View style={{ height: 12 }} />

      <Button
        title="Load Strava and Streets from JSON (Classic)"
        onPress={() => loadFromJson(false)}
      />

      <View style={{ height: 12 }} />

      <Button
        title="Load Strava and Streets from JSON (AI)"
        onPress={() => loadFromJson(true)}
      />

      <View style={{ height: 12 }} />

      <Button
        color="#FC4C02"
        title={loading.all ? 'Working...' : 'Connect to Strava & Populate Streets'}
        onPress={connectLoadAll}
      />

      <View style={{ height: 12 }} />

      <Button
        title={loading.osm ? 'Working...' : 'Only Load Streets'}
        onPress={loadStreetsOnly}
      />

      <View style={{ height: 12 }} />

      <Button
        title={loading.strava ? 'Working...' : 'Connect to and Load Strava'}
        onPress={() => loadStrava({ showLoading: true })}
      />

      <View style={{ height: 12 }} />

      {statusMessage && (
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
          {statusMessage !== 'Done' && (loading.osm || loading.strava || loading.all) && (
            <ActivityIndicator style={{ marginRight: 8 }} />
          )}
          <Text>{statusMessage}</Text>
        </View>
      )}

      {progress > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text>
            {progressMessage || 'Working...'} ({progress}%)
          </Text>
          <View style={{ height: 10, backgroundColor: '#eee', borderRadius: 5, marginTop: 4 }}>
            <View
              style={{
                width: `${progress}%`,
                height: '100%',
                backgroundColor: '#4CAF50',
                borderRadius: 5,
              }}
            />
          </View>
        </View>
      )}

      <View style={{ height: 12 }} />
      <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 12 }} />
      <View style={{ height: 12 }} />

      <View style={styles.row}>
        <Text style={styles.title}>
          Radius: {radiusMiles.toFixed(1)} mi
        </Text>

        <View style={styles.buttons}>
          <TouchableOpacity
            onPress={() =>
              setRadiusMiles(Math.max(0.5, +(radiusMiles - 0.5).toFixed(1)))
            }
            style={styles.input}
          >
            <Text>-</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              setRadiusMiles(Math.min(5, +(radiusMiles + 0.5).toFixed(1)))
            }
            style={styles.input}
          >
            <Text>+</Text>
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: 'white' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 6, marginVertical: 8, width: '15%', alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  buttons: {
    flexDirection: "row",
    gap: 10, // or marginRight/marginLeft if older RN
  }
});
