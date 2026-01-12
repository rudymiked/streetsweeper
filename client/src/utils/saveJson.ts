import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

export async function saveJsonFile(filename: string, data: any) {
  const json = JSON.stringify(data, null, 2);

  if (Platform.OS === 'web') {
    // --- Web: trigger a download ---
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
    return;
  }

  // --- Native: save to device filesystem ---
  const path = FileSystem.Directory + filename;
  await FileSystem.writeAsStringAsync(path, json);
  return path;
}
