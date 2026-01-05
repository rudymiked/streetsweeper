const dotenv = require('dotenv');
dotenv.config();

module.exports = () => ({
    expo: {
        name: "Streetsweeper",
        slug: "Streetsweeper",
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
            bundleIdentifier: "com.rudysoftware.streetsweeper",   // ← ADD THIS
            "infoPlist": {
                "ITSAppUsesNonExemptEncryption": false
            }
        },
        android: {
            adaptiveIcon: {
                foregroundImage: "./assets/adaptive-icon.png",
                backgroundColor: "#ffffff"
            },
            edgeToEdgeEnabled: true,
            predictiveBackGestureEnabled: false
        },
        web: {
            favicon: "./assets/favicon.png"
        },
        scheme: "myapp",
        extra: {
            STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
            STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
            eas: {
                projectId: "bdaca001-4998-4318-b737-3abc157cb2f3"
            }
        }
    }
});
