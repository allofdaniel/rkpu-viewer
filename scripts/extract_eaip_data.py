"""
eAIP Korea 데이터 추출 스크립트
항로(ATS Routes), 웨이포인트, NAVAID, 공역 정보를 추출하여 JSON으로 저장

ENR 섹션:
- ENR 3.1: ATS Routes (국내/국제 항로)
- ENR 3.3: Area Navigation Routes (RNAV 항로)
- ENR 3.5: Other Routes
- ENR 3.6: En-route Holding
- ENR 4.1: Radio Navigation Aids (VOR, DME, NDB 등)
- ENR 4.4: Significant Points (웨이포인트)
- ENR 5.1: Prohibited, Restricted, Danger Areas
- ENR 5.2: Military Exercise and Training Areas
- ENR 5.3: Other Dangerous Activities
- ENR 5.4: Air Navigation Obstacles
- ENR 5.5: Aerial Sporting/Recreational Activities
- ENR 5.6: Bird Migration and Sensitive Fauna
"""

import requests
from bs4 import BeautifulSoup
import re
import json
import os
from datetime import datetime

BASE_URL = "https://aim.koca.go.kr/eaipPub/Package/2025-12-24-AIRAC/html/eAIP"

PAGES = {
    "routes_ats": "KR-ENR-3.1-en-GB.html",
    "routes_rnav": "KR-ENR-3.3-en-GB.html",
    "routes_other": "KR-ENR-3.5-en-GB.html",
    "holding": "KR-ENR-3.6-en-GB.html",
    "navaids": "KR-ENR-4.1-en-GB.html",
    "waypoints": "KR-ENR-4.4-en-GB.html",
    "airspace_prd": "KR-ENR-5.1-en-GB.html",
    "airspace_mil": "KR-ENR-5.2-en-GB.html",
    "airspace_danger": "KR-ENR-5.3-en-GB.html",
    "obstacles": "KR-ENR-5.4-en-GB.html",
    "activities": "KR-ENR-5.5-en-GB.html",
    "bird_areas": "KR-ENR-5.6-en-GB.html",
}

def parse_coordinate(coord_str):
    """
    좌표 문자열을 십진 도수로 변환
    예: "372449N" -> 37.4136111, "1265542E" -> 126.9283333
    """
    if not coord_str:
        return None

    coord_str = coord_str.strip().upper()

    # 위도 패턴: DDMMSS[.s]N/S
    lat_match = re.match(r'(\d{2})(\d{2})(\d{2}(?:\.\d+)?)\s*([NS])', coord_str)
    # 경도 패턴: DDDMMSS[.s]E/W
    lon_match = re.match(r'(\d{3})(\d{2})(\d{2}(?:\.\d+)?)\s*([EW])', coord_str)

    if lat_match:
        deg = int(lat_match.group(1))
        min = int(lat_match.group(2))
        sec = float(lat_match.group(3))
        direction = lat_match.group(4)
        decimal = deg + min/60 + sec/3600
        return -decimal if direction == 'S' else decimal

    if lon_match:
        deg = int(lon_match.group(1))
        min = int(lon_match.group(2))
        sec = float(lon_match.group(3))
        direction = lon_match.group(4)
        decimal = deg + min/60 + sec/3600
        return -decimal if direction == 'W' else decimal

    return None

def parse_lat_lon(coord_str):
    """
    "372449N 1265542E" 형식의 좌표를 파싱
    """
    if not coord_str:
        return None, None

    # 위도와 경도 분리
    parts = coord_str.strip().split()
    if len(parts) >= 2:
        lat = parse_coordinate(parts[0])
        lon = parse_coordinate(parts[1])
        return lat, lon

    # 단일 문자열에서 위도/경도 추출
    match = re.match(r'(\d{6}(?:\.\d+)?[NS])\s*(\d{7}(?:\.\d+)?[EW])', coord_str)
    if match:
        lat = parse_coordinate(match.group(1))
        lon = parse_coordinate(match.group(2))
        return lat, lon

    return None, None

def fetch_page(page_name):
    """페이지 HTML 가져오기"""
    url = f"{BASE_URL}/{PAGES[page_name]}"
    print(f"Fetching {page_name}: {url}")

    try:
        response = requests.get(url, timeout=30)
        response.encoding = 'utf-8'
        return BeautifulSoup(response.text, 'html.parser')
    except Exception as e:
        print(f"Error fetching {page_name}: {e}")
        return None

def extract_waypoints(soup):
    """ENR 4.4 - 웨이포인트 추출"""
    waypoints = []

    if not soup:
        return waypoints

    # 테이블 찾기
    tables = soup.find_all('table')

    for table in tables:
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 2:
                # 첫 번째 셀: 웨이포인트 이름
                name_cell = cells[0].get_text(strip=True)
                # 두 번째 셀: 좌표
                coord_cell = cells[1].get_text(strip=True) if len(cells) > 1 else ""

                # 웨이포인트 이름 패턴 (5자리 영문)
                name_match = re.search(r'\b([A-Z]{5})\b', name_cell)
                if name_match:
                    name = name_match.group(1)
                    lat, lon = parse_lat_lon(coord_cell)

                    if lat and lon:
                        waypoints.append({
                            "name": name,
                            "lat": round(lat, 6),
                            "lon": round(lon, 6),
                            "type": "waypoint"
                        })

    # 중복 제거
    seen = set()
    unique_waypoints = []
    for wp in waypoints:
        key = wp["name"]
        if key not in seen:
            seen.add(key)
            unique_waypoints.append(wp)

    return unique_waypoints

def extract_navaids(soup):
    """ENR 4.1 - NAVAID 추출"""
    navaids = []

    if not soup:
        return navaids

    # 테이블에서 VOR/DME/TACAN/NDB 정보 추출
    tables = soup.find_all('table')

    current_navaid = {}

    for table in tables:
        rows = table.find_all('tr')
        for row in rows:
            text = row.get_text()

            # VORTAC, VOR/DME, TACAN, NDB 패턴 찾기
            type_match = re.search(r'\b(VORTAC|VOR/DME|VOR|TACAN|NDB|DME)\b', text)

            # 식별자 패턴 (2-3자리 영문)
            id_match = re.search(r'\b([A-Z]{2,3})\b', text)

            # 주파수 패턴
            freq_match = re.search(r'(\d{2,3}\.\d{1,2})\s*MHz', text)

            # 좌표 패턴
            coord_match = re.search(r'(\d{6}[NS])\s*(\d{7}[EW])', text.replace(' ', ''))

            if coord_match and type_match:
                lat = parse_coordinate(coord_match.group(1))
                lon = parse_coordinate(coord_match.group(2))

                if lat and lon:
                    navaid = {
                        "name": "",
                        "ident": id_match.group(1) if id_match else "",
                        "type": type_match.group(1),
                        "lat": round(lat, 6),
                        "lon": round(lon, 6),
                        "freq": freq_match.group(1) if freq_match else ""
                    }
                    navaids.append(navaid)

    return navaids

def extract_routes(soup, route_type="ATS"):
    """ENR 3.1/3.3 - 항로 추출"""
    routes = []

    if not soup:
        return routes

    current_route = None

    # 항로 이름 패턴들
    route_patterns = [
        r'\b([ABGHJKLMNPRSTVWY]\d{1,4})\b',  # A582, B332, V11, Y233 등
        r'\b([A-Z]{1,2}\d{2,4})\b'  # 일반적인 항로명
    ]

    tables = soup.find_all('table')

    for table in tables:
        rows = table.find_all('tr')

        for row in rows:
            text = row.get_text()
            cells = row.find_all(['td', 'th'])

            # 새 항로 시작 감지
            for pattern in route_patterns:
                route_match = re.search(pattern, text)
                if route_match:
                    route_name = route_match.group(1)

                    # 새 항로 시작
                    if current_route and current_route["points"]:
                        routes.append(current_route)

                    current_route = {
                        "name": route_name,
                        "type": route_type,
                        "points": []
                    }
                    break

            # 좌표 추출
            coord_match = re.search(r'(\d{6}[NS])\s*(\d{7}[EW])', text.replace(' ', ''))
            if coord_match and current_route:
                lat = parse_coordinate(coord_match.group(1))
                lon = parse_coordinate(coord_match.group(2))

                if lat and lon:
                    # 웨이포인트 이름 찾기
                    wp_match = re.search(r'\b([A-Z]{3,5})\b', text)
                    wp_name = wp_match.group(1) if wp_match else ""

                    current_route["points"].append({
                        "name": wp_name,
                        "lat": round(lat, 6),
                        "lon": round(lon, 6)
                    })

    if current_route and current_route["points"]:
        routes.append(current_route)

    return routes

def extract_airspaces(soup, airspace_type="P"):
    """ENR 5.1-5.6 - 공역 추출"""
    airspaces = []

    if not soup:
        return airspaces

    current_airspace = None

    # 공역 이름 패턴: RK P73, RK R75, RK D1 등
    airspace_pattern = r'RK\s*([PDR])\s*(\d+[A-Z]?)'

    tables = soup.find_all('table')

    for table in tables:
        text = table.get_text()

        # 공역 이름 찾기
        name_match = re.search(airspace_pattern, text)
        if name_match:
            airspace_code = f"RK {name_match.group(1)}{name_match.group(2)}"

            # 모든 좌표 추출
            coords = re.findall(r'(\d{6}[NS])\s*(\d{7}[EW])', text.replace(' ', ''))

            if coords:
                boundary = []
                for lat_str, lon_str in coords:
                    lat = parse_coordinate(lat_str)
                    lon = parse_coordinate(lon_str)
                    if lat and lon:
                        boundary.append([round(lon, 6), round(lat, 6)])

                if boundary:
                    # 원형 공역 체크 (반경 정보)
                    radius_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:NM|nm|해리)', text)

                    airspace = {
                        "name": airspace_code,
                        "type": name_match.group(1),  # P, D, R
                        "boundary": boundary
                    }

                    if radius_match:
                        airspace["radius_nm"] = float(radius_match.group(1))

                    # 고도 정보
                    alt_match = re.search(r'(?:GND|SFC).*?(\d+(?:,\d+)?)\s*(?:ft|FT|FL)', text)
                    if alt_match:
                        airspace["upper_limit"] = alt_match.group(1).replace(',', '')

                    airspaces.append(airspace)

    return airspaces

def main():
    """메인 실행 함수"""
    output_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
    os.makedirs(output_dir, exist_ok=True)

    all_data = {
        "metadata": {
            "source": "eAIP Korea",
            "airac": "2025-12-24",
            "extracted": datetime.now().isoformat(),
            "url": BASE_URL
        },
        "waypoints": [],
        "navaids": [],
        "routes": [],
        "airspaces": []
    }

    # 웨이포인트 추출
    print("\n=== Extracting Waypoints (ENR 4.4) ===")
    soup = fetch_page("waypoints")
    if soup:
        waypoints = extract_waypoints(soup)
        all_data["waypoints"] = waypoints
        print(f"Extracted {len(waypoints)} waypoints")

    # NAVAID 추출
    print("\n=== Extracting NAVAIDs (ENR 4.1) ===")
    soup = fetch_page("navaids")
    if soup:
        navaids = extract_navaids(soup)
        all_data["navaids"] = navaids
        print(f"Extracted {len(navaids)} navaids")

    # ATS 항로 추출
    print("\n=== Extracting ATS Routes (ENR 3.1) ===")
    soup = fetch_page("routes_ats")
    if soup:
        routes = extract_routes(soup, "ATS")
        all_data["routes"].extend(routes)
        print(f"Extracted {len(routes)} ATS routes")

    # RNAV 항로 추출
    print("\n=== Extracting RNAV Routes (ENR 3.3) ===")
    soup = fetch_page("routes_rnav")
    if soup:
        routes = extract_routes(soup, "RNAV")
        all_data["routes"].extend(routes)
        print(f"Extracted {len(routes)} RNAV routes")

    # 공역 추출
    print("\n=== Extracting Airspaces (ENR 5.1) ===")
    soup = fetch_page("airspace_prd")
    if soup:
        airspaces = extract_airspaces(soup)
        all_data["airspaces"].extend(airspaces)
        print(f"Extracted {len(airspaces)} airspaces")

    # JSON 저장
    output_file = os.path.join(output_dir, 'korea_airspace.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)

    print(f"\n=== Data saved to {output_file} ===")
    print(f"Total waypoints: {len(all_data['waypoints'])}")
    print(f"Total navaids: {len(all_data['navaids'])}")
    print(f"Total routes: {len(all_data['routes'])}")
    print(f"Total airspaces: {len(all_data['airspaces'])}")

    return all_data

if __name__ == "__main__":
    main()
