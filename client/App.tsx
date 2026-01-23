import React, { useState, useRef, useEffect } from 'react';
import { Platform, TouchableOpacity, Text, Animated, Dimensions, Pressable } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { StateProvider } from './src/state/StateContext';
import MapScreen from './src/screens/MapScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import Constants from "expo-constants";
import { palette } from './src/theme/palette';

let StatusBar: any = null;
if (Platform.OS !== 'web') {
  StatusBar = require('expo-status-bar').StatusBar;
}

const Drawer = createDrawerNavigator();
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function App() {

  if (!Constants.expoConfig || !Constants.expoConfig.extra) {
    throw new Error("Missing configuration in app.config.js");
  }

  const [settingsOpen, setSettingsOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: settingsOpen ? 0 : SCREEN_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [settingsOpen]);

  const toggleSettings = () => setSettingsOpen(prev => !prev);

  return (
    <StateProvider>
      <NavigationContainer>
        <Drawer.Navigator
          initialRouteName="StreetSweeper"
          screenOptions={{
            headerShown: true,
            headerStyle: { backgroundColor: palette.panel },
            headerTintColor: palette.text,
            headerTitleStyle: { color: palette.text, letterSpacing: 0.3 },
            drawerStyle: { backgroundColor: palette.panel },
            drawerActiveTintColor: palette.accent,
            drawerInactiveTintColor: palette.muted,
            sceneContainerStyle: { backgroundColor: '#0b1224' },
            headerRight: () => (
              <TouchableOpacity onPress={toggleSettings} style={{ paddingRight: 16 }}>
                <Text style={{ fontSize: 20, color: palette.accent }}>⚙️</Text>
              </TouchableOpacity>
            ),
          }}
        >
          <Drawer.Screen name="StreetSweeper" component={MapScreen} />
        </Drawer.Navigator>
      </NavigationContainer>

      {/* Slide-in Settings Panel */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: Platform.OS === 'web' ? SCREEN_WIDTH * 0.2 : '100%',
          height: '100%',
          backgroundColor: palette.panel,
          transform: [{ translateX: slideAnim }],
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 12,
          elevation: 10,
          zIndex: 100,
          borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
          borderLeftColor: palette.panelBorder,
        }}
      >
        <SettingsScreen closePanel={() => setSettingsOpen(false)} />
      </Animated.View>

      {/* Backdrop */}
      {settingsOpen && (
        <Pressable
          onPress={toggleSettings}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 50,
          }}
        />
      )}

      {StatusBar && <StatusBar style="auto" />}
    </StateProvider>
  );
}
