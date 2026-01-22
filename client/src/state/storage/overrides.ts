import AsyncStorage from "@react-native-async-storage/async-storage";
import { Street } from "../matching/matcher_kdtree";

export async function saveOverrides(overrides: Street[]) {
  await AsyncStorage.setItem("streetOverrides", JSON.stringify(overrides));
}

export async function loadOverrides() {
  const raw = await AsyncStorage.getItem("streetOverrides");
  return raw ? JSON.parse(raw) : {};
}