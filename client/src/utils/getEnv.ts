import Constants from "expo-constants";
import { Platform } from "react-native";

export function getEnv(key: string) {
  if (Platform.OS === "web") {
    return process.env[key];
  }
  return Constants.expoConfig?.extra?.[key];
}