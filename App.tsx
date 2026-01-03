import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { StateProvider } from './src/state/StateContext';
import MapScreen from './src/screens/MapScreen';
import SyncScreen from './src/screens/SyncScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { TouchableOpacity, Text } from 'react-native';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

export default function App() {
  return (
    <StateProvider>
      <NavigationContainer>
        <Drawer.Navigator
          initialRouteName="Map"
          screenOptions={({ navigation }) => ({
            headerShown: true,
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ paddingRight: 16 }}>
                <Text style={{ fontSize: 20 }}>⚙️</Text>
              </TouchableOpacity>
            ),
          })}
        >
          <Drawer.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
          <Drawer.Screen name="Sync" component={SyncScreen} options={{ title: 'Sync with Strava' }} />
          <Drawer.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        </Drawer.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </StateProvider>
  );
}
