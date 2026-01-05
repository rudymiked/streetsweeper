import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Alert, FlatList, ScrollView, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAppState, StravaActivity } from '../state/StateContext';

// Only import Expo modules on native platforms
let AuthSession: any = null;
let WebBrowser: any = null;
const isWeb = typeof Platform === 'undefined' || Platform?.OS === 'web';
if (!isWeb) {
  AuthSession = require('expo-auth-session');
  WebBrowser = require('expo-web-browser');
}

// Read Strava credentials from Expo config extra
const expoExtra =
  (Constants.expoConfig && Constants.expoConfig.extra) ||
  {};

const STRAVA_CLIENT_ID = Number(expoExtra.STRAVA_CLIENT_ID) || 0;
const STRAVA_CLIENT_SECRET = expoExtra.STRAVA_CLIENT_SECRET || '';
const STRAVA_SCOPES = 'activity:read_all';

export default function SyncScreen() {
  const { setActivities: setStateActivities, markStreetsRunByActivities } = useAppState();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [redirectUri, setRedirectUri] = useState<string>('');

  useEffect(() => {
    if (isWeb) {
      // On web, check if we're returning from Strava OAuth
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      if (code) {
        // We got an auth code, exchange it for token
        exchangeCodeForToken(code);
        // Clean up the URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // Set redirect URI
      const uri = `${window.location.origin}${window.location.pathname}`;
      setRedirectUri(uri);
    } else {
      // On native, use Expo's redirect URI
      if (!AuthSession) throw new Error('AuthSession not available');
      const uri = AuthSession.makeRedirectUri({
        preferLocalhost: true,
      });
      setRedirectUri(uri);
    }
  }, []);

  async function connectToStrava() {
    setMessage(null);

    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
      setMessage(
        `Missing Strava credentials. Register this redirect domain in Strava: ${redirectUri}`
      );
      return;
    }

    const authUrl =
      `https://www.strava.com/oauth/authorize` +
      `?client_id=${STRAVA_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&approval_prompt=auto` +
      `&scope=${encodeURIComponent(STRAVA_SCOPES)}`;

    try {
      if (isWeb) {
        // On web, redirect directly to Strava (user will be redirected back here)
        window.location.href = authUrl;
      } else {
        // On native, use WebBrowser
        if (!WebBrowser) throw new Error('WebBrowser not available');
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

        if (!result || result.type !== 'success') {
          setMessage(`Strava auth failed or cancelled: ${JSON.stringify(result)}`);
          return;
        }

        const returnedUrl = result.url;
        const params = new URL(returnedUrl).searchParams;
        const code = params.get('code');

        if (!code) {
          setMessage(`No code returned from Strava: ${returnedUrl}`);
          return;
        }

        await exchangeCodeForToken(code);
      }
    } catch (err: any) {
      setMessage(`Auth error: ${err.message}`);
    }
  }

  async function exchangeCodeForToken(code: string) {
    try {
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

      if (tokenRes.ok && tokenJson.access_token) {
        setAccessToken(tokenJson.access_token);
        setMessage('Connected to Strava');
      } else {
        setMessage(`Token error: ${JSON.stringify(tokenJson)}`);
      }
    } catch (err: any) {
      setMessage(`Token exchange error: ${err.message}`);
    }
  }

async function doSyncToStrava() {
  if (!accessToken) {
    Alert.alert('Not connected', 'Please connect to Strava first.');
    return;
  }

  setSyncing(true);
  setMessage(null);

  try {
    let page = 1;
    const perPage = 200; // Strava max
    const allActivities = [];

    while (true) {
      const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!res.ok) {
        setMessage(`Failed to fetch activities: ${res.status}`);
        setSyncing(false);
        return;
      }

      const data = await res.json();

      // Stop when Strava returns an empty array
      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      allActivities.push(...data);
      page++;
    }

    // Map for your UI state
    const activitiesForState: StravaActivity[] = allActivities.map((act) => ({
      id: act.id,
      name: act.name,
      type: act.type,
      distance: act.distance,
      date: act.start_date,
      polyline: act.map?.summary_polyline || '',
      moving_time: act.moving_time,
      elapsed_time: act.elapsed_time,
      start_date: act.start_date,
    }));

    setActivities(allActivities);
    setStateActivities(activitiesForState);
    // Mark streets that were covered by these activities (if streets already loaded)
    try {
      markStreetsRunByActivities(activitiesForState);
    } catch (e) {
      // ignore if context not available
    }
    setMessage(`Loaded ${allActivities.length} activities`);
  } catch (err: any) {
    setMessage(`Sync error: ${err.message}`);
  }

  setSyncing(false);
}


  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Strava Activities</Text>

      <View style={{ backgroundColor: '#f0f0f0', padding: 12, marginTop: 12 }}>
        <Text style={{ fontWeight: '600', fontSize: 12 }}>
          Register this domain in Strava:
        </Text>
        <Text style={{ fontSize: 11, marginTop: 6, fontFamily: 'monospace' }}>
          {redirectUri || 'Loading...'}
        </Text>
      </View>

      <View style={{ marginTop: 16 }}>
        <Button
          title={accessToken ? 'Connected to Strava' : 'Connect to Strava'}
          onPress={connectToStrava}
        />
      </View>

      {accessToken && (
        <View style={{ marginTop: 12 }}>
          <Button
            title={syncing ? 'Loading...' : 'Load My Activities'}
            onPress={doSyncToStrava}
            disabled={syncing}
          />
          <View style={{ height: 8 }} />
          <Button
            title="Disconnect"
            onPress={() => {
              setAccessToken(null);
              setActivities([]);
              setMessage('Disconnected');
            }}
          />
        </View>
      )}

      {message && (
        <View style={{ marginTop: 12, backgroundColor: '#fef3cd', padding: 8 }}>
          <Text style={{ fontSize: 12 }}>{message}</Text>
        </View>
      )}

      {activities.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>
            Your Activities
          </Text>
          <FlatList
            data={activities}
            scrollEnabled={false}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <View style={styles.activityItem}>
                <Text style={{ fontWeight: '500' }}>{item.name}</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  {item.type} · {(item.distance / 1000).toFixed(2)} km ·{' '}
                  {new Date(item.start_date).toLocaleDateString()}
                </Text>
              </View>
            )}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  activityItem: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
});
