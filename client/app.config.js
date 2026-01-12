module.exports = () => ({
    name: "streetsweeper",
    slug: "streetsweeper",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
        image: "./assets/splash-icon.png",
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
            foregroundImage: "./assets/adaptive-icon.png",
            backgroundColor: "#ffffff"
        },
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        config: {
            googleMaps: {
                apiKey: process.env.GOOGLE_MAPS_API_KEY
            }
        }
    },
    web: {
        favicon: "./assets/favicon.png"
    },
    scheme: "myapp",
    extra: {
        STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
        STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
        DEFAULT_MAP_CENTER_LATITUDE: process.env.DEFAULT_MAP_CENTER_LATITUDE,
        DEFAULT_MAP_CENTER_LONGITUDE: process.env.DEFAULT_MAP_CENTER_LONGITUDE,
        DEFAULT_MAP_RADIUS_MILES: process.env.DEFAULT_MAP_RADIUS_MILES,
        OSM_OVERPASS_API_URL: process.env.OSM_OVERPASS_API_URL,
        OSM_OVERPASS_API_URL_TWO: process.env.OSM_OVERPASS_API_URL_TWO,
        OSM_OVERPASS_API_URL_THREE: process.env.OSM_OVERPASS_API_URL_THREE,
        STRAVA_API_BASE_URL: process.env.STRAVA_API_BASE_URL,
        STRAVA_AUTHORIZE_URL: process.env.STRAVA_AUTHORIZE_URL,
        STRAVA_AUTHORIZE_TOKEN_URL: process.env.STRAVA_AUTHORIZE_TOKEN_URL,
        STEP_DISTANCE_METERS:process.env.STEP_DISTANCE_METERS,
        TOLERANCE_METERS:process.env.TOLERANCE_METERS,
        GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
        eas: {
            projectId: "bdaca001-4998-4318-b737-3abc157cb2f3"
        }
    }
});
