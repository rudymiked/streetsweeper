import Constants from "expo-constants";
import { Platform } from "react-native";

export function getEnv(key: string) {
  // Try extra config first (works for all platforms including web after build)
  const fromExtra = Constants.expoConfig?.extra?.[key];
  if (fromExtra !== undefined) return fromExtra;
  
  // Fallback to process.env for web
  if (Platform.OS === "web" && typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  
  return undefined;
}