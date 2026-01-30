require('dotenv').config();

module.exports = () => ({
    name: "streetsweeper",
    slug: "streetsweeper",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/streetsweeperlogo.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
        image: "./assets/streetsweeperlogo.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
    },
    ios: {
        supportsTablet: true,
        bundleIdentifier: "com.rudysoftware.streetsweeper",
        infoPlist: {
            ITSAppUsesNonExemptEncryption: false
        }
    },
    android: {
        package: "com.rudysoftware.streetsweeper",
        adaptiveIcon: {
            foregroundImage: "./assets/streetsweeperlogo.png",
            backgroundColor: "#ffffff"
        },
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        config: {
            googleMaps: {
                apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
            }
        }
    },
    web: {
        favicon: "./assets/streetsweeperlogo.png"
    },
    scheme: "myapp",
    extra: {
        EXPO_PUBLIC_STRAVA_CLIENT_ID: process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID,
        // STRAVA_CLIENT_SECRET removed - now stored securely on server
        EXPO_PUBLIC_DEFAULT_MAP_CENTER_LATITUDE: process.env.EXPO_PUBLIC_DEFAULT_MAP_CENTER_LATITUDE,
        EXPO_PUBLIC_DEFAULT_MAP_CENTER_LONGITUDE: process.env.EXPO_PUBLIC_DEFAULT_MAP_CENTER_LONGITUDE,
        EXPO_PUBLIC_DEFAULT_MAP_RADIUS_MILES: process.env.EXPO_PUBLIC_DEFAULT_MAP_RADIUS_MILES,
        EXPO_PUBLIC_OSM_OVERPASS_API_URL: process.env.EXPO_PUBLIC_OSM_OVERPASS_API_URL,
        EXPO_PUBLIC_OSM_OVERPASS_API_URL_TWO: process.env.EXPO_PUBLIC_OSM_OVERPASS_API_URL_TWO,
        EXPO_PUBLIC_OSM_OVERPASS_API_URL_THREE: process.env.EXPO_PUBLIC_OSM_OVERPASS_API_URL_THREE,
        EXPO_PUBLIC_STRAVA_API_BASE_URL: process.env.EXPO_PUBLIC_STRAVA_API_BASE_URL,
        EXPO_PUBLIC_STRAVA_AUTHORIZE_URL: process.env.EXPO_PUBLIC_STRAVA_AUTHORIZE_URL,
        // Secure proxy URLs (API keys stored server-side)
        EXPO_PUBLIC_STRAVA_TOKEN_PROXY_URL: process.env.EXPO_PUBLIC_STRAVA_TOKEN_PROXY_URL,
        EXPO_PUBLIC_OPENAI_PROXY_URL: process.env.EXPO_PUBLIC_OPENAI_PROXY_URL,
        EXPO_PUBLIC_STEP_DISTANCE_METERS: process.env.EXPO_PUBLIC_STEP_DISTANCE_METERS,
        EXPO_PUBLIC_TOLERANCE_METERS: process.env.EXPO_PUBLIC_TOLERANCE_METERS,
        EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        // AZURE_OPENAI secrets removed - now stored securely on server
        eas: {
            projectId: "bdaca001-4998-4318-b737-3abc157cb2f3"
        }
    }
});