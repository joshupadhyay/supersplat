/**
 * Convert a lat/lng position to Three.js local coordinates
 * relative to a reference point and heading.
 *
 * This is the inverse of MiniMap's cameraToLatLng().
 */
export function latLngToLocal(
  fromLat: number,
  fromLng: number,
  heading: number,
  toLat: number,
  toLng: number,
  scale = 1.25,
): { x: number; z: number } {
  const northM = (toLat - fromLat) * 111320;
  const eastM =
    (toLng - fromLng) * 111320 * Math.cos((fromLat * Math.PI) / 180);
  const theta = (heading * Math.PI) / 180;
  return {
    x: (eastM * Math.cos(theta) - northM * Math.sin(theta)) / scale,
    z: (eastM * Math.sin(theta) + northM * Math.cos(theta)) / scale,
  };
}
