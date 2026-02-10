/**
 * Coordinates Utilities
 * 항공 좌표 형식 변환 유틸리티
 */

/**
 * 십진수 좌표를 항공 좌표 형식으로 변환
 * @param lat - 위도 (십진수)
 * @param lon - 경도 (십진수)
 * @returns 항공 좌표 형식 문자열 (예: "N3733.99E12658.68")
 *
 * @example
 * formatAviationCoord(37.5665, 126.978) // "N3733.99E12658.68"
 * formatAviationCoord(-37.5665, -126.978) // "S3733.99W12658.68"
 */
export function formatAviationCoord(lat: number, lon: number): string {
  // 위도 처리
  const latDir = lat >= 0 ? 'N' : 'S';
  const absLat = Math.abs(lat);
  const latDeg = Math.floor(absLat);
  const latMin = (absLat - latDeg) * 60;
  const latStr = `${latDir}${latDeg.toString().padStart(2, '0')}${latMin.toFixed(2).padStart(5, '0')}`;

  // 경도 처리
  const lonDir = lon >= 0 ? 'E' : 'W';
  const absLon = Math.abs(lon);
  const lonDeg = Math.floor(absLon);
  const lonMin = (absLon - lonDeg) * 60;
  const lonStr = `${lonDir}${lonDeg.toString().padStart(3, '0')}${lonMin.toFixed(2).padStart(5, '0')}`;

  return latStr + lonStr;
}

/**
 * 십진수 좌표를 도분초(DMS) 형식으로 변환
 * @param lat - 위도 (십진수)
 * @param lon - 경도 (십진수)
 * @returns DMS 형식 문자열 (예: "37°33'59.4\"N 126°58'40.8\"E")
 *
 * @example
 * formatDMS(37.5665, 126.978) // "37°33'59.4\"N 126°58'40.8\"E"
 * formatDMS(-37.5665, -126.978) // "37°33'59.4\"S 126°58'40.8\"W"
 */
export function formatDMS(lat: number, lon: number): string {
  // 위도 처리
  const latDir = lat >= 0 ? 'N' : 'S';
  const absLat = Math.abs(lat);
  const latDeg = Math.floor(absLat);
  const latMinDecimal = (absLat - latDeg) * 60;
  const latMin = Math.floor(latMinDecimal);
  const latSec = (latMinDecimal - latMin) * 60;
  const latStr = `${latDeg}°${latMin}'${latSec.toFixed(1)}"${latDir}`;

  // 경도 처리
  const lonDir = lon >= 0 ? 'E' : 'W';
  const absLon = Math.abs(lon);
  const lonDeg = Math.floor(absLon);
  const lonMinDecimal = (absLon - lonDeg) * 60;
  const lonMin = Math.floor(lonMinDecimal);
  const lonSec = (lonMinDecimal - lonMin) * 60;
  const lonStr = `${lonDeg}°${lonMin}'${lonSec.toFixed(1)}"${lonDir}`;

  return `${latStr} ${lonStr}`;
}

/**
 * 항공 좌표 형식을 십진수 좌표로 파싱
 * @param coord - 항공 좌표 형식 문자열 (예: "N3733.99E12658.68")
 * @returns 십진수 좌표 객체 또는 null (파싱 실패 시)
 *
 * @example
 * parseAviationCoord("N3733.99E12658.68") // { lat: 37.5665, lon: 126.978 }
 * parseAviationCoord("S3733.99W12658.68") // { lat: -37.5665, lon: -126.978 }
 * parseAviationCoord("invalid") // null
 */
export function parseAviationCoord(coord: string): { lat: number; lon: number } | null {
  // 항공 좌표 형식: N/S + DDMM.MM + E/W + DDDMM.MM
  // 예: N3733.99E12658.68
  const regex = /^([NS])(\d{2})(\d{2}\.\d{2})([EW])(\d{3})(\d{2}\.\d{2})$/;
  const match = coord.match(regex);

  if (!match) {
    return null;
  }

  const [, latDir, latDeg, latMin, lonDir, lonDeg, lonMin] = match;

  // 위도 계산
  const lat = parseFloat(latDeg) + parseFloat(latMin) / 60;
  const finalLat = latDir === 'S' ? -lat : lat;

  // 경도 계산
  const lon = parseFloat(lonDeg) + parseFloat(lonMin) / 60;
  const finalLon = lonDir === 'W' ? -lon : lon;

  return {
    lat: parseFloat(finalLat.toFixed(6)),
    lon: parseFloat(finalLon.toFixed(6)),
  };
}
