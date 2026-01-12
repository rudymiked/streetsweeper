import React, { useState, useRef, useEffect } from 'react';
import { Platform, TouchableOpacity, Text, View, Animated, Dimensions, Pressable } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { StateProvider } from './src/state/StateContext';
import MapScreen from './src/screens/MapScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import Constants from "expo-constants";

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
          initialRouteName="Map"
          screenOptions={{
            headerShown: true,
            headerRight: () => (
              <TouchableOpacity onPress={toggleSettings} style={{ paddingRight: 16 }}>
                <Text style={{ fontSize: 20 }}>⚙️</Text>
              </TouchableOpacity>
            ),
          }}
        >
          <Drawer.Screen name="Map" component={MapScreen} />
        </Drawer.Navigator>
      </NavigationContainer>

      {/* Slide-in Settings Panel */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: SCREEN_WIDTH * 0.2,
          height: '100%',
          backgroundColor: 'white',
          transform: [{ translateX: slideAnim }],
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 10,
          elevation: 10,
          zIndex: 100,
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
