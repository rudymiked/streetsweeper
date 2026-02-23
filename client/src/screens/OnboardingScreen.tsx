import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette } from '../theme/palette';
import { getEnv } from '../utils/getEnv';
import { useAppState } from '../state/StateContext';

const isWeb = Platform.OS === 'web';

// Storage keys
const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
const STRAVA_ATHLETE_KEY = 'strava_athlete';
const STRAVA_TOKEN_KEY = 'strava_access_token';

type OnboardingStep = 'welcome' | 'strava' | 'location' | 'complete';

type StravaAthlete = {
  id: number;
  firstname: string;
  lastname: string;
  city: string;
  state: string;
  country: string;
  profile: string;
  profile_medium: string;
};

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { setCenter, setMapZoom } = useAppState();
  
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [loading, setLoading] = useState(false);
  const [athlete, setAthlete] = useState<StravaAthlete | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Strava OAuth flow
  async function getStravaAuthCode(clientId: number, scopes: string): Promise<string> {
    const AuthSession = require('expo-auth-session');
    const WebBrowser = require('expo-web-browser');

    if (isWeb) {
      // For production web, use the current origin; for dev, use Expo proxy
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const redirectUriWeb = isLocalhost 
        ? AuthSession.makeRedirectUri({ useProxy: true })
        : window.location.origin + '/';

      const authUrl =
        `${getEnv('EXPO_PUBLIC_STRAVA_AUTHORIZE_URL')}` +
        `?client_id=${clientId}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUriWeb)}` +
        `&approval_prompt=auto` +
        `&scope=${encodeURIComponent(scopes)}`;

      const popup = window.open(authUrl, 'strava_auth', 'width=600,height=700');
      if (!popup) throw new Error('Popup blocked. Please allow popups for this site.');

      return await new Promise((resolve, reject) => {
        const timeout = 120000; // 2 minutes
        const interval = 500;
        let elapsed = 0;

        const id = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(id);
            reject(new Error('Authorization window was closed'));
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
    const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });

    const authUrl =
      `${getEnv('EXPO_PUBLIC_STRAVA_AUTHORIZE_URL')}` +
      `?client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&approval_prompt=auto` +
      `&scope=${encodeURIComponent(scopes)}`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    if (!result || result.type !== 'success') {
      throw new Error('Authorization was cancelled');
    }

    const params = new URL(result.url).searchParams;
    const code = params.get('code');

    if (!code) throw new Error('No authorization code returned');

    return code;
  }

  async function exchangeStravaToken(code: string): Promise<{ access_token: string; athlete: StravaAthlete }> {
    const STRAVA_TOKEN_PROXY_URL =
      getEnv('EXPO_PUBLIC_STRAVA_TOKEN_PROXY_URL') ||
      'https://streetsweeper-overpass-hjbthgeffjdqe0hf.westus2-01.azurewebsites.net/api/strava-token';

    const res = await fetch(STRAVA_TOKEN_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const json = await res.json();

    if (!res.ok || !json.access_token) {
      throw new Error(json.error || 'Token exchange failed');
    }

    return json;
  }

  async function fetchAthleteProfile(accessToken: string): Promise<StravaAthlete> {
    const STRAVA_API_BASE = getEnv('EXPO_PUBLIC_STRAVA_API_BASE_URL') || 'https://www.strava.com/api/v3';
    
    const res = await fetch(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error('Failed to fetch athlete profile');
    }

    return res.json();
  }

  async function connectStrava() {
    setLoading(true);
    setError(null);

    try {
      const STRAVA_CLIENT_ID = Number(getEnv('EXPO_PUBLIC_STRAVA_CLIENT_ID')) || 0;
      const STRAVA_SCOPES = 'activity:read_all';

      if (!STRAVA_CLIENT_ID) {
        throw new Error('Strava configuration is missing. Please contact support.');
      }

      // Get auth code
      const code = await getStravaAuthCode(STRAVA_CLIENT_ID, STRAVA_SCOPES);

      // Exchange for token and get athlete info
      const tokenResponse = await exchangeStravaToken(code);
      const accessToken = tokenResponse.access_token;
      
      // Get athlete profile (might be in token response or fetch separately)
      let athleteData: StravaAthlete;
      if (tokenResponse.athlete) {
        athleteData = tokenResponse.athlete;
      } else {
        athleteData = await fetchAthleteProfile(accessToken);
      }

      // Save to storage
      await AsyncStorage.setItem(STRAVA_TOKEN_KEY, accessToken);
      await AsyncStorage.setItem(STRAVA_ATHLETE_KEY, JSON.stringify(athleteData));

      setAthlete(athleteData);
      setStep('location');
    } catch (err: any) {
      console.error('Strava connection error:', err);
      setError(err.message || 'Failed to connect to Strava');
    } finally {
      setLoading(false);
    }
  }

  async function useCurrentLocation() {
    setLoading(true);
    setError(null);

    try {
      if (isWeb) {
        if (!navigator.geolocation) {
          throw new Error('Geolocation is not supported by your browser');
        }

        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 60000,
          });
        });

        setCenter({
          name: 'Current Location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setMapZoom(15);
      } else {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          throw new Error('Location permission was denied');
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setCenter({
          name: 'Current Location',
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        setMapZoom(15);
      }

      await completeOnboarding();
    } catch (err: any) {
      console.error('Location error:', err);
      setError(err.message || 'Failed to get location');
    } finally {
      setLoading(false);
    }
  }

  async function useStravaLocation() {
    if (athlete?.city && athlete?.state) {
      setLoading(true);
      setError(null);

      try {
        // Try to geocode the athlete's city
        const query = `${athlete.city}, ${athlete.state}, ${athlete.country || ''}`.trim();
        
        const params = new URLSearchParams({
          format: 'json',
          q: query,
          limit: '1',
        });

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          {
            headers: {
              'User-Agent': 'StreetSweeper/1.0',
              Accept: 'application/json',
            },
          }
        );

        if (res.ok) {
          const results = await res.json();
          if (results && results.length > 0) {
            setCenter({
              name: `${athlete.city}, ${athlete.state}`,
              latitude: parseFloat(results[0].lat),
              longitude: parseFloat(results[0].lon),
            });
            setMapZoom(14);
          }
        }

        await completeOnboarding();
      } catch (err: any) {
        console.error('Geocoding error:', err);
        // Even if geocoding fails, complete onboarding
        await completeOnboarding();
      } finally {
        setLoading(false);
      }
    } else {
      await completeOnboarding();
    }
  }

  async function completeOnboarding() {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    setStep('complete');
    setTimeout(() => onComplete(), 500);
  }

  async function skipStrava() {
    setStep('location');
  }

  // Render different steps
  const renderWelcome = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Text style={styles.emoji}>🧹</Text>
      </View>
      <Text style={styles.heading}>Welcome to StreetSweeper</Text>
      <Text style={styles.subheading}>
        Track every street you run and discover new routes in your neighborhood
      </Text>
      
      <View style={styles.featureList}>
        <FeatureItem emoji="🗺️" text="See which streets you've run" />
        <FeatureItem emoji="🏃" text="Sync your activities from Strava" />
        <FeatureItem emoji="📍" text="Plan routes to explore new areas" />
        <FeatureItem emoji="🏆" text="Complete your neighborhood" />
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('strava')}>
        <Text style={styles.primaryButtonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStravaConnect = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Text style={styles.emoji}>🔗</Text>
      </View>
      <Text style={styles.heading}>Connect to Strava</Text>
      <Text style={styles.subheading}>
        We'll import your running activities to show which streets you've already covered
      </Text>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.stravaButton, loading && styles.buttonDisabled]}
        onPress={connectStrava}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.stravaButtonText}>Connect with Strava</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipButton} onPress={skipStrava}>
        <Text style={styles.skipButtonText}>Skip for now</Text>
      </TouchableOpacity>

      <Text style={styles.privacyText}>
        We only read your activity data. We never post to your account.
      </Text>
    </View>
  );

  const renderLocation = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Text style={styles.emoji}>📍</Text>
      </View>
      <Text style={styles.heading}>Set Your Location</Text>
      <Text style={styles.subheading}>
        Choose where you want to track your street coverage
      </Text>

      {athlete && (
        <View style={styles.athleteCard}>
          {athlete.profile_medium && (
            <Image source={{ uri: athlete.profile_medium }} style={styles.athleteAvatar} />
          )}
          <View style={styles.athleteInfo}>
            <Text style={styles.athleteName}>
              {athlete.firstname} {athlete.lastname}
            </Text>
            {athlete.city && (
              <Text style={styles.athleteLocation}>
                {athlete.city}, {athlete.state}
              </Text>
            )}
          </View>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={useCurrentLocation}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Use Current Location</Text>
        )}
      </TouchableOpacity>

      {athlete?.city && (
        <TouchableOpacity
          style={[styles.secondaryButton, loading && styles.buttonDisabled]}
          onPress={useStravaLocation}
          disabled={loading}
        >
          <Text style={styles.secondaryButtonText}>
            Use Strava Location ({athlete.city})
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.skipButton}
        onPress={completeOnboarding}
        disabled={loading}
      >
        <Text style={styles.skipButtonText}>Set up later</Text>
      </TouchableOpacity>
    </View>
  );

  const renderComplete = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Text style={styles.emoji}>✅</Text>
      </View>
      <Text style={styles.heading}>You're all set!</Text>
      <Text style={styles.subheading}>
        Open Settings to load your streets and start tracking
      </Text>
      <ActivityIndicator color={palette.accent} size="large" style={{ marginTop: 24 }} />
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {step === 'welcome' && renderWelcome()}
      {step === 'strava' && renderStravaConnect()}
      {step === 'location' && renderLocation()}
      {step === 'complete' && renderComplete()}

      {/* Progress dots */}
      <View style={styles.progressContainer}>
        <View style={[styles.dot, step === 'welcome' && styles.dotActive]} />
        <View style={[styles.dot, step === 'strava' && styles.dotActive]} />
        <View style={[styles.dot, step === 'location' && styles.dotActive]} />
      </View>
    </ScrollView>
  );
}

function FeatureItem({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureEmoji}>{emoji}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

// Helper to check if onboarding is complete
export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

// Helper to reset onboarding (useful for testing)
export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
  await AsyncStorage.removeItem(STRAVA_ATHLETE_KEY);
  await AsyncStorage.removeItem(STRAVA_TOKEN_KEY);
}

// Helper to get stored athlete
export async function getStoredAthlete(): Promise<StravaAthlete | null> {
  try {
    const value = await AsyncStorage.getItem(STRAVA_ATHLETE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

// Helper to get stored token
export async function getStoredStravaToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STRAVA_TOKEN_KEY);
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.dark,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    minHeight: '100%',
  },
  stepContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: palette.panel,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 48,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: palette.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subheading: {
    fontSize: 16,
    color: palette.muted,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  featureList: {
    width: '100%',
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: palette.panel,
    borderRadius: 12,
    marginBottom: 8,
  },
  featureEmoji: {
    fontSize: 24,
    marginRight: 16,
  },
  featureText: {
    fontSize: 16,
    color: palette.text,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: palette.panel,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.panelBorder,
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '500',
  },
  stravaButton: {
    backgroundColor: '#FC4C02', // Strava orange
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  stravaButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
    marginTop: 8,
  },
  skipButtonText: {
    color: palette.muted,
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 100, 100, 0.15)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    width: '100%',
  },
  errorText: {
    color: '#ff6b6b',
    textAlign: 'center',
    fontSize: 14,
  },
  privacyText: {
    color: palette.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
  athleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.panel,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    width: '100%',
  },
  athleteAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 16,
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
  },
  athleteLocation: {
    fontSize: 14,
    color: palette.muted,
    marginTop: 4,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.panelBorder,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: palette.accent,
    width: 24,
  },
});
