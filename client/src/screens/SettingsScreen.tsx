import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { StravaActivity, useAppState } from '../state/StateContext';
import Constants from 'expo-constants';
import { IconButton } from 'react-native-paper';
import { sleep } from '../utils/utils';
import osmMock from '../../assets/mock/osm.json';
import stravaMock from '../../assets/mock/strava.json';
import { getEnv } from '../utils/getEnv';
import { palette } from '../theme/palette';

const extra = Constants.expoConfig?.extra ?? {};

let Location: any = null;
const isWeb = typeof Platform === 'undefined' || Platform?.OS === 'web';
if (!isWeb) {
  Location = require('expo-location');
}

type ActionButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
};

function ActionButton({ title, onPress, variant = 'primary', disabled }: ActionButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' && styles.buttonTextSecondary,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
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
    manualEdits,
    exportManualEdits,
  } = useAppState();

  const [loading, setLoading] = useState({
    osm: false,
    strava: false,
    all: false,
  });

  const [addressInput, setAddressInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleRadiusChange = (val: number) => {
    // Ensure numeric updates (slider on web can send stringy numbers)
    const numeric = typeof val === 'number' ? val : Number(val);
    if (!Number.isNaN(numeric)) {
      const clamped = Math.min(10, Math.max(0.5, numeric));
      setRadiusMiles(clamped);
    }
  };

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
      <View style={styles.headerRow}>
        <IconButton icon="close" onPress={closePanel} iconColor={palette.muted} />
      </View>

      <Text style={styles.title}>Settings</Text>
      <Text style={[styles.text, styles.sectionLabel]}>Current Center: {center.name}</Text>

      <ActionButton title="Use Current Location" onPress={useCurrentLocation} />

      <View style={styles.spacer} />

      <Text style={styles.text}>Or enter an address:</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter address"
        placeholderTextColor={palette.muted}
        value={addressInput}
        onChangeText={setAddressInput}
      />
      <ActionButton title="Set as Center" onPress={useAddress} variant="secondary" />

      <View style={styles.spacer} />
      <Text style={styles.text}>Load radius (mi): {radiusMiles.toFixed(1)}</Text>
      {Platform.OS === 'web' ? (
        <input
          type="range"
          min={0.5}
          max={10}
          step={0.1}
          value={radiusMiles}
          onChange={(e) => handleRadiusChange(parseFloat(e.target.value))}
          style={{ width: '100%', marginTop: 8 }}
        />
      ) : (
        <Slider
          minimumValue={0.5}
          maximumValue={10}
          step={0.1}
          value={radiusMiles}
          onValueChange={handleRadiusChange}
          onSlidingComplete={handleRadiusChange}
          minimumTrackTintColor={palette.accentStrong}
          maximumTrackTintColor={palette.panelBorder}
          thumbTintColor={palette.accent}
          style={{ width: '100%', marginTop: 8 }}
        />
      )}

      <View style={styles.divider} />

      <ActionButton
        title="Load Strava and Streets from JSON (Classic)"
        onPress={() => loadFromJson(false)}
        variant="secondary"
      />

      <View style={styles.spacer} />

      <ActionButton
        title="Load Strava and Streets from JSON (AI)"
        onPress={() => loadFromJson(true)}
        variant="secondary"
      />

      <View style={styles.spacer} />

      <ActionButton
        title={loading.all ? 'Working...' : 'Connect to Strava & Populate Streets'}
        onPress={connectLoadAll}
        variant="danger"
        disabled={loading.all}
      />

      <View style={styles.spacer} />

      <ActionButton
        title={loading.osm ? 'Working...' : 'Only Load Streets'}
        onPress={loadStreetsOnly}
        variant="primary"
        disabled={loading.osm}
      />

      <View style={styles.spacer} />

      <ActionButton
        title={loading.strava ? 'Working...' : 'Connect to and Load Strava'}
        onPress={() => loadStrava({ showLoading: true })}
        variant="primary"
        disabled={loading.strava}
      />

      {statusMessage && (
        <View style={styles.statusRow}>
          {statusMessage !== 'Done' && (loading.osm || loading.strava || loading.all) && (
            <ActivityIndicator style={{ marginRight: 8 }} color={palette.accent} />
          )}
          <Text style={styles.text}>{statusMessage}</Text>
        </View>
      )}

      {progress > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.text}>
            {progressMessage || 'Working...'} ({progress}%)
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%` },
              ]}
            />
          </View>
        </View>
      )}

      <View style={styles.divider} />

      <ActionButton
        title={"Export Manual Edits"}
        onPress={exportManualEdits}
        disabled={manualEdits.length === 0}
        variant="secondary"
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: palette.panel,
  },
  headerRow: { alignItems: 'flex-end' },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    color: palette.text,
    letterSpacing: 0.3,
  },
  text: { color: palette.text },
  sectionLabel: { marginVertical: 8, color: palette.muted },
  input: {
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: '#0c182d',
    color: palette.text,
    padding: 10,
    borderRadius: 8,
    marginVertical: 8,
    width: '100%',
  },
  spacer: { height: 12 },
  divider: { height: 1, backgroundColor: palette.panelBorder, marginVertical: 14 },
  button: {
    width: '100%',
    backgroundColor: palette.accent,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    marginTop: 12,
  },
  buttonSecondary: { backgroundColor: '#0c182d' },
  buttonDanger: { backgroundColor: palette.accentStrong },
  buttonDisabled: { opacity: 0.55 },
  buttonText: {
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#0b1224',
  },
  buttonTextSecondary: { color: palette.text },
  statusRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center' },
  progressTrack: {
    height: 10,
    backgroundColor: palette.panelBorder,
    borderRadius: 5,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.accent,
    borderRadius: 5,
  },
});
