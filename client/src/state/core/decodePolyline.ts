export function decodePolyline(polylineStr: string) {
  const coords: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;

  while (index < polylineStr.length) {
    let result = 0, shift = 0, byte = 0;

    do {
      byte = polylineStr.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += (result & 1) ? ~(result >> 1) : result >> 1;

    result = 0; shift = 0;
    do {
      byte = polylineStr.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += (result & 1) ? ~(result >> 1) : result >> 1;

    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return coords;
}
