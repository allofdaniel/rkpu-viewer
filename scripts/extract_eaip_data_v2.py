"""
eAIP Korea 데이터 추출 스크립트 v2
항로, 웨이포인트, NAVAID 정보를 정확하게 추출

HTML 테이블 구조:
- 항로명: "A582", "B332" 등
- 웨이포인트: "ANYANG VORTAC (SEL)", "POLEG" 등
- 좌표: "372449N 1265542E" 형식
- 고도: "UNL / 4 500 ft AMSL" (Upper/Lower limit)
- MEA: "3 400 ft AMSL"
"""

import requests
from bs4 import BeautifulSoup
import re
import json
import os
from datetime import datetime

BASE_URL = "https://aim.koca.go.kr/eaipPub/Package/2025-12-24-AIRAC/html/eAIP"

def parse_dms_to_decimal(coord_str):
    """
    DMS 좌표를 십진수로 변환
    "372449N" -> 37.4136111 (37도 24분 49초)
    "1265542E" -> 126.9283333
    """
    if not coord_str:
        return None

    coord_str = coord_str.strip().upper()

    # 위도 (DDMMSS[.s]N/S)
    lat_match = re.match(r'^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)\s*([NS])$', coord_str)
    if lat_match:
        deg = int(lat_match.group(1))
        min_val = int(lat_match.group(2))
        sec = float(lat_match.group(3))
        direction = lat_match.group(4)
        decimal = deg + min_val/60 + sec/3600
        return round(-decimal if direction == 'S' else decimal, 6)

    # 경도 (DDDMMSS[.s]E/W)
    lon_match = re.match(r'^(\d{3})(\d{2})(\d{2}(?:\.\d+)?)\s*([EW])$', coord_str)
    if lon_match:
        deg = int(lon_match.group(1))
        min_val = int(lon_match.group(2))
        sec = float(lon_match.group(3))
        direction = lon_match.group(4)
        decimal = deg + min_val/60 + sec/3600
        return round(-decimal if direction == 'W' else decimal, 6)

    return None

def parse_altitude(alt_str):
    """
    고도 문자열 파싱
    "4 500 ft AMSL" -> 4500
    "FL 310" -> 31000
    "UNL" -> None (무제한)
    """
    if not alt_str:
        return None

    alt_str = alt_str.strip().upper()

    if alt_str == 'UNL' or alt_str == 'UNLIMITED':
        return None  # 무제한

    # FL (Flight Level)
    fl_match = re.search(r'FL\s*(\d+)', alt_str)
    if fl_match:
        return int(fl_match.group(1)) * 100  # FL 310 = 31000 ft

    # ft AMSL
    ft_match = re.search(r'([\d\s]+)\s*ft', alt_str, re.IGNORECASE)
    if ft_match:
        return int(ft_match.group(1).replace(' ', '').replace(',', ''))

    return None

def fetch_page(page_name):
    """페이지 HTML 가져오기"""
    url = f"{BASE_URL}/{page_name}"
    print(f"Fetching: {url}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    try:
        response = requests.get(url, headers=headers, timeout=60)
        response.encoding = 'utf-8'
        return BeautifulSoup(response.text, 'html.parser')
    except Exception as e:
        print(f"Error fetching {page_name}: {e}")
        return None

def extract_routes_from_html(soup, route_type="ATS"):
    """
    ENR 3.1/3.3에서 항로 추출
    테이블 구조 분석하여 정확히 추출
    """
    routes = []

    if not soup:
        return routes

    # 모든 테이블 찾기
    tables = soup.find_all('table')

    current_route = None

    for table in tables:
        rows = table.find_all('tr')

        for row in rows:
            cells = row.find_all(['td', 'th'])
            if not cells:
                continue

            row_text = row.get_text(separator=' ', strip=True)

            # 항로 이름 행 찾기 (예: "A582 Route availability:")
            route_match = re.match(r'^([ABGHJKLMNPRSTVWYZ]\d{1,4})\*?\s', row_text)
            if route_match:
                # 이전 항로 저장
                if current_route and current_route.get('points'):
                    routes.append(current_route)

                route_name = route_match.group(1)
                current_route = {
                    'name': route_name,
                    'type': route_type,
                    'points': []
                }
                continue

            # 웨이포인트 행 찾기 (△, ▲, ∆ 기호로 시작)
            # 예: "∆ ANYANG VORTAC (SEL) 372449N 1265542E"
            # 예: "▲ POLEG 371249N 1265935E"
            if len(cells) >= 3 and current_route:
                first_cell = cells[0].get_text(strip=True)

                # 삼각형 기호 체크 (웨이포인트 행 표시)
                if first_cell in ['∆', '▲', '△', 'Δ']:
                    # 웨이포인트 이름
                    wp_name_cell = cells[1].get_text(strip=True) if len(cells) > 1 else ""
                    # 좌표
                    coord_cell = cells[2].get_text(strip=True) if len(cells) > 2 else ""

                    # 좌표 파싱 (372449N 1265542E 형식)
                    coord_match = re.search(r'(\d{6}[NS])\s*(\d{7}[EW])', coord_cell.replace(' ', ''))

                    if coord_match:
                        lat = parse_dms_to_decimal(coord_match.group(1))
                        lon = parse_dms_to_decimal(coord_match.group(2))

                        if lat and lon:
                            # 웨이포인트 이름 정리 (VORTAC 등 제거)
                            wp_name = wp_name_cell.split('(')[0].strip()
                            if '(' in wp_name_cell:
                                # ANYANG VORTAC (SEL) -> SEL 또는 ANYANG
                                ident_match = re.search(r'\(([A-Z]{2,3})\)', wp_name_cell)
                                if ident_match:
                                    wp_ident = ident_match.group(1)
                                else:
                                    wp_ident = wp_name.split()[0] if wp_name else ""
                            else:
                                wp_ident = wp_name

                            current_route['points'].append({
                                'name': wp_ident,
                                'full_name': wp_name_cell,
                                'lat': lat,
                                'lon': lon
                            })

                # 세그먼트 정보 행 (고도, MEA 등)
                # 예: "174° 354° 12.4 UNL 4 500 ft AMSL 3 400 ft AMSL 10 ..."
                elif current_route.get('points') and re.search(r'\d+°', row_text):
                    # 마지막 포인트에 고도 정보 추가
                    if current_route['points']:
                        last_point = current_route['points'][-1]

                        # Upper/Lower limit 찾기
                        upper_match = re.search(r'UNL|FL\s*\d+', row_text)
                        lower_match = re.search(r'(\d[\d\s]*ft\s*AMSL|FL\s*\d+)', row_text)

                        # MEA (Minimum En-route Altitude)
                        mea_match = re.search(r'(\d[\d\s,]*)\s*ft\s*AMSL', row_text)
                        if mea_match:
                            mea_str = mea_match.group(1).replace(' ', '').replace(',', '')
                            if mea_str.isdigit():
                                last_point['mea_ft'] = int(mea_str)

    # 마지막 항로 저장
    if current_route and current_route.get('points'):
        routes.append(current_route)

    return routes

def extract_waypoints_from_html(soup):
    """
    ENR 4.4에서 웨이포인트 추출
    """
    waypoints = []

    if not soup:
        return waypoints

    # 테이블에서 웨이포인트 찾기
    tables = soup.find_all('table')

    for table in tables:
        rows = table.find_all('tr')

        for row in rows:
            cells = row.find_all(['td', 'th'])
            if len(cells) < 2:
                continue

            # 첫 번째 셀: 웨이포인트 이름 (5자리 영문)
            first_cell = cells[0].get_text(strip=True)

            # 5자리 웨이포인트 이름 패턴
            wp_match = re.match(r'^([A-Z]{5})$', first_cell)
            if wp_match:
                wp_name = wp_match.group(1)

                # 두 번째 셀: 좌표
                coord_cell = cells[1].get_text(strip=True) if len(cells) > 1 else ""
                coord_match = re.search(r'(\d{6}[NS])\s*(\d{7}[EW])', coord_cell.replace(' ', ''))

                if coord_match:
                    lat = parse_dms_to_decimal(coord_match.group(1))
                    lon = parse_dms_to_decimal(coord_match.group(2))

                    if lat and lon:
                        waypoints.append({
                            'name': wp_name,
                            'lat': lat,
                            'lon': lon,
                            'type': 'waypoint'
                        })

    # 중복 제거
    seen = set()
    unique_wps = []
    for wp in waypoints:
        if wp['name'] not in seen:
            seen.add(wp['name'])
            unique_wps.append(wp)

    return unique_wps

def extract_navaids_from_html(soup):
    """
    ENR 4.1에서 NAVAID 추출
    """
    navaids = []

    if not soup:
        return navaids

    tables = soup.find_all('table')

    for table in tables:
        rows = table.find_all('tr')

        for row in rows:
            text = row.get_text(separator=' ', strip=True)

            # VORTAC, VOR/DME, TACAN, NDB 패턴
            navaid_match = re.search(r'([A-Z][A-Z\s]+)\s+(VORTAC|VOR/DME|VOR|TACAN|NDB|DME)\s*\(([A-Z]{2,3})\)', text)

            if navaid_match:
                name = navaid_match.group(1).strip()
                nav_type = navaid_match.group(2)
                ident = navaid_match.group(3)

                # 좌표 찾기
                coord_match = re.search(r'(\d{6}[NS])\s*(\d{7}[EW])', text.replace(' ', ''))

                # 주파수 찾기
                freq_match = re.search(r'(\d{2,3}\.\d{1,2})\s*MHz', text)

                if coord_match:
                    lat = parse_dms_to_decimal(coord_match.group(1))
                    lon = parse_dms_to_decimal(coord_match.group(2))

                    if lat and lon:
                        navaids.append({
                            'name': name,
                            'ident': ident,
                            'type': nav_type,
                            'lat': lat,
                            'lon': lon,
                            'freq': freq_match.group(1) if freq_match else ""
                        })

    # 중복 제거
    seen = set()
    unique_navs = []
    for nav in navaids:
        if nav['ident'] not in seen:
            seen.add(nav['ident'])
            unique_navs.append(nav)

    return unique_navs


def extract_airspaces_from_html(soup, airspace_category="PRD"):
    """
    ENR 5.1~5.5에서 공역 추출
    - 5.1: Prohibited (P), Restricted (R), Danger (D) Areas
    - 5.2: Military Exercise and Training Areas (MOA, HTA, etc.)
    - 5.3: Other Activities (CATA)
    - 5.5: Aerial Sporting (UA)
    """
    airspaces = []

    if not soup:
        return airspaces

    # 모든 테이블 순회
    tables = soup.find_all('table')

    for table in tables:
        rows = table.find_all('tr')

        for row in rows:
            text = row.get_text(separator=' ', strip=True)

            # 공역 이름 패턴들
            # RK P73, RK R75, RK D1, MOA 1, HTA 1, CATA 1, UA 1, etc.
            airspace_patterns = [
                # P/R/D Areas: RK P73, RK R1
                (r'RK\s*([PDR])\s*(\d+[A-Z]?)', 'PRD'),
                # MOA: MOA 1, MOA 2A
                (r'\b(MOA)\s*(\d+[A-Z]?)\b', 'MOA'),
                # HTA: HTA 1
                (r'\b(HTA)\s*(\d+[A-Z]?)\b', 'HTA'),
                # CATA: CATA 1, CATA 7L
                (r'\b(CATA)\s*(\d+[A-Z]?)\b', 'CATA'),
                # UA: UA 1, UA 2
                (r'\b(UA)\s*(\d+[A-Z]?)\b', 'UA'),
                # Alert Area
                (r'\b(ALERT)\s*(\d+[A-Z]?)\b', 'ALERT'),
            ]

            airspace_name = None
            airspace_type = None

            for pattern, a_type in airspace_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    if a_type == 'PRD':
                        airspace_type = match.group(1).upper()  # P, R, or D
                        airspace_name = f"RK {airspace_type}{match.group(2)}"
                    else:
                        airspace_type = a_type
                        airspace_name = f"{match.group(1).upper()} {match.group(2)}"
                    break

            if not airspace_name:
                continue

            # 좌표 추출 - 다양한 형식 지원
            coords = []

            # 다각형 좌표: 373114.0N 1272813.3E - 373212.1N 1273114.2E ...
            coord_matches = re.findall(r'(\d{6}(?:\.\d+)?)\s*([NS])\s*(\d{7}(?:\.\d+)?)\s*([EW])', text)

            for lat_val, lat_dir, lon_val, lon_dir in coord_matches:
                lat_str = lat_val + lat_dir
                lon_str = lon_val + lon_dir
                lat = parse_dms_to_decimal(lat_str)
                lon = parse_dms_to_decimal(lon_str)
                if lat and lon:
                    coords.append([lon, lat])

            # 원형 공역: "circle radius X NM centered on DDMMSSN DDDMMSSSE"
            circle_match = re.search(r'circle\s+(?:radius\s+)?(\d+(?:\.\d+)?)\s*(?:NM|nm|km)?\s+centered\s+on\s+(\d{6}[NS])\s*(\d{7}[EW])', text, re.IGNORECASE)
            is_circle = False
            radius_nm = None
            center_lat = None
            center_lon = None

            if circle_match:
                is_circle = True
                radius_nm = float(circle_match.group(1))
                center_lat = parse_dms_to_decimal(circle_match.group(2))
                center_lon = parse_dms_to_decimal(circle_match.group(3))

            # 반경만 있는 경우 (좌표가 있으면 그것을 중심으로)
            if not is_circle:
                radius_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:NM|nm|해리)\s*radius', text, re.IGNORECASE)
                if radius_match and len(coords) == 1:
                    is_circle = True
                    radius_nm = float(radius_match.group(1))
                    center_lon, center_lat = coords[0]
                    coords = []

            # 고도 정보 추출
            upper_limit = None
            lower_limit = None

            # UNL/GND, FL 400/10000 ft AMSL, etc.
            alt_patterns = [
                r'(UNL|FL\s*\d+|\d[\d\s,]*ft(?:\s*(?:AMSL|AGL))?)\s*/\s*(GND|SFC|FL\s*\d+|\d[\d\s,]*ft(?:\s*(?:AMSL|AGL))?)',
                r'(FL\s*\d+)\s*/\s*(\d[\d\s,]*ft)',
            ]

            for alt_pattern in alt_patterns:
                alt_match = re.search(alt_pattern, text, re.IGNORECASE)
                if alt_match:
                    upper_limit = parse_altitude(alt_match.group(1))
                    lower_limit = parse_altitude(alt_match.group(2))
                    break

            # 유효한 공역만 추가
            if coords or is_circle:
                airspace = {
                    'name': airspace_name,
                    'type': airspace_type,
                    'category': airspace_category
                }

                if is_circle:
                    airspace['is_circle'] = True
                    airspace['radius_nm'] = radius_nm
                    airspace['center_lat'] = center_lat
                    airspace['center_lon'] = center_lon
                else:
                    airspace['boundary'] = coords

                if upper_limit is not None:
                    airspace['upper_limit_ft'] = upper_limit
                if lower_limit is not None:
                    airspace['lower_limit_ft'] = lower_limit

                # 시간 정보 추출
                time_match = re.search(r'(\d{4})-(\d{4})\s*UTC', text)
                if time_match:
                    airspace['active_time'] = f"{time_match.group(1)}-{time_match.group(2)} UTC"

                # H24 (24시간)
                if re.search(r'\bH24\b', text):
                    airspace['active_time'] = 'H24'

                airspaces.append(airspace)

    # 중복 제거
    seen = set()
    unique_airspaces = []
    for asp in airspaces:
        if asp['name'] not in seen:
            seen.add(asp['name'])
            unique_airspaces.append(asp)

    return unique_airspaces


def generate_circle_polygon(center_lon, center_lat, radius_nm, num_points=32):
    """
    원형 공역을 다각형 좌표로 변환
    radius_nm: 해리 단위 반경
    """
    import math

    # 해리를 도로 변환 (1도 ≈ 60해리)
    radius_deg = radius_nm / 60.0

    coords = []
    for i in range(num_points):
        angle = 2 * math.pi * i / num_points
        lon = center_lon + radius_deg * math.cos(angle) / math.cos(math.radians(center_lat))
        lat = center_lat + radius_deg * math.sin(angle)
        coords.append([round(lon, 6), round(lat, 6)])

    # 폴리곤을 닫기 위해 첫 점 추가
    coords.append(coords[0])

    return coords

def main():
    """메인 실행 함수"""
    output_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
    os.makedirs(output_dir, exist_ok=True)

    all_data = {
        'metadata': {
            'source': 'eAIP Korea',
            'airac': '2025-12-24',
            'extracted': datetime.now().isoformat(),
            'url': BASE_URL
        },
        'waypoints': [],
        'navaids': [],
        'routes': [],
        'airspaces': []
    }

    # ATS 항로 추출 (ENR 3.1)
    print("\n=== Extracting ATS Routes (ENR 3.1) ===")
    soup = fetch_page("KR-ENR-3.1-en-GB.html")
    if soup:
        routes = extract_routes_from_html(soup, "ATS")
        all_data['routes'].extend(routes)
        print(f"Extracted {len(routes)} ATS routes")
        for r in routes[:5]:
            print(f"  - {r['name']}: {len(r['points'])} points")

    # RNAV 항로 추출 (ENR 3.3)
    print("\n=== Extracting RNAV Routes (ENR 3.3) ===")
    soup = fetch_page("KR-ENR-3.3-en-GB.html")
    if soup:
        routes = extract_routes_from_html(soup, "RNAV")
        all_data['routes'].extend(routes)
        print(f"Extracted {len(routes)} RNAV routes")
        for r in routes[:5]:
            print(f"  - {r['name']}: {len(r['points'])} points")

    # NAVAID 추출 (ENR 4.1)
    print("\n=== Extracting NAVAIDs (ENR 4.1) ===")
    soup = fetch_page("KR-ENR-4.1-en-GB.html")
    if soup:
        navaids = extract_navaids_from_html(soup)
        all_data['navaids'] = navaids
        print(f"Extracted {len(navaids)} NAVAIDs")
        for n in navaids[:5]:
            print(f"  - {n['ident']} ({n['type']}): {n['lat']}, {n['lon']}")

    # 웨이포인트 추출 (ENR 4.4)
    print("\n=== Extracting Waypoints (ENR 4.4) ===")
    soup = fetch_page("KR-ENR-4.4-en-GB.html")
    if soup:
        waypoints = extract_waypoints_from_html(soup)
        all_data['waypoints'] = waypoints
        print(f"Extracted {len(waypoints)} waypoints")
        for w in waypoints[:5]:
            print(f"  - {w['name']}: {w['lat']}, {w['lon']}")

    # 공역 추출 (ENR 5.1 - Prohibited, Restricted, Danger Areas)
    print("\n=== Extracting PRD Airspaces (ENR 5.1) ===")
    soup = fetch_page("KR-ENR-5.1-en-GB.html")
    if soup:
        airspaces = extract_airspaces_from_html(soup, "PRD")
        all_data['airspaces'].extend(airspaces)
        print(f"Extracted {len(airspaces)} PRD airspaces")
        for a in airspaces[:5]:
            print(f"  - {a['name']} ({a['type']})")

    # 공역 추출 (ENR 5.2 - Military Exercise and Training Areas)
    print("\n=== Extracting Military Airspaces (ENR 5.2) ===")
    soup = fetch_page("KR-ENR-5.2-en-GB.html")
    if soup:
        airspaces = extract_airspaces_from_html(soup, "MIL")
        all_data['airspaces'].extend(airspaces)
        print(f"Extracted {len(airspaces)} Military airspaces")
        for a in airspaces[:5]:
            print(f"  - {a['name']} ({a['type']})")

    # 공역 추출 (ENR 5.3 - Other Activities / CATA)
    print("\n=== Extracting CATA Airspaces (ENR 5.3) ===")
    soup = fetch_page("KR-ENR-5.3-en-GB.html")
    if soup:
        airspaces = extract_airspaces_from_html(soup, "CATA")
        all_data['airspaces'].extend(airspaces)
        print(f"Extracted {len(airspaces)} CATA airspaces")
        for a in airspaces[:5]:
            print(f"  - {a['name']} ({a['type']})")

    # 공역 추출 (ENR 5.5 - Aerial Sporting/Recreational)
    print("\n=== Extracting UA Airspaces (ENR 5.5) ===")
    soup = fetch_page("KR-ENR-5.5-en-GB.html")
    if soup:
        airspaces = extract_airspaces_from_html(soup, "UA")
        all_data['airspaces'].extend(airspaces)
        print(f"Extracted {len(airspaces)} UA airspaces")
        for a in airspaces[:5]:
            print(f"  - {a['name']} ({a['type']})")

    # 원형 공역을 다각형으로 변환
    for airspace in all_data['airspaces']:
        if airspace.get('is_circle'):
            center_lon = airspace.get('center_lon')
            center_lat = airspace.get('center_lat')
            radius_nm = airspace.get('radius_nm')
            if center_lon and center_lat and radius_nm:
                airspace['boundary'] = generate_circle_polygon(center_lon, center_lat, radius_nm)

    # JSON 저장
    output_file = os.path.join(output_dir, 'korea_airspace.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)

    print(f"\n=== Data saved to {output_file} ===")
    print(f"Total routes: {len(all_data['routes'])}")
    print(f"Total waypoints: {len(all_data['waypoints'])}")
    print(f"Total NAVAIDs: {len(all_data['navaids'])}")
    print(f"Total airspaces: {len(all_data['airspaces'])}")

    # 통계 출력
    total_points = sum(len(r['points']) for r in all_data['routes'])
    print(f"Total route points: {total_points}")

    # 공역 유형별 통계
    airspace_types = {}
    for asp in all_data['airspaces']:
        t = asp.get('type', 'UNKNOWN')
        airspace_types[t] = airspace_types.get(t, 0) + 1
    print(f"Airspace types: {airspace_types}")

    return all_data

if __name__ == "__main__":
    main()
