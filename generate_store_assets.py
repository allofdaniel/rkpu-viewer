"""
Generate Play Store assets for RKPU Viewer app
- Feature Graphic: 1024x500px
- Phone Screenshots: 1080x1920px (9:16)
"""

from PIL import Image, ImageDraw, ImageFont
import os

OUTPUT_DIR = "public/store-assets"

def create_feature_graphic():
    """Create feature graphic 1024x500px"""
    width, height = 1024, 500
    img = Image.new('RGBA', (width, height), (26, 26, 46, 255))  # #1a1a2e
    draw = ImageDraw.Draw(img)

    # Gradient-like background with aviation blue accent
    for y in range(height):
        alpha = int(255 * (1 - y / height * 0.3))
        draw.line([(0, y), (width, y)], fill=(0, 119, 190, int(alpha * 0.3)))

    # Draw airplane silhouette
    center_x = width // 2
    center_y = height // 2 - 30
    scale = 2.5

    # Airplane body
    body_width = int(25 * scale)
    body_height = int(200 * scale)
    draw.ellipse(
        [center_x - body_width, center_y - body_height // 2,
         center_x + body_width, center_y + body_height // 2],
        fill=(255, 255, 255, 80)
    )

    # Wings
    wing_width = int(180 * scale)
    wing_height = int(50 * scale)
    wing_y = center_y
    draw.polygon([
        (center_x - wing_width, wing_y + wing_height),
        (center_x - int(25 * scale), wing_y - int(10 * scale)),
        (center_x + int(25 * scale), wing_y - int(10 * scale)),
        (center_x + wing_width, wing_y + wing_height),
    ], fill=(255, 255, 255, 80))

    # Tail
    tail_width = int(70 * scale)
    tail_height = int(40 * scale)
    tail_y = center_y - body_height // 2 + int(30 * scale)
    draw.polygon([
        (center_x - tail_width, tail_y + tail_height),
        (center_x, tail_y),
        (center_x + tail_width, tail_y + tail_height),
    ], fill=(255, 255, 255, 80))

    # App title
    try:
        title_font = ImageFont.truetype("arial.ttf", 72)
        subtitle_font = ImageFont.truetype("arial.ttf", 36)
    except:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()

    # Title text
    title = "RKPU 비행절차 뷰어"
    bbox = draw.textbbox((0, 0), title, font=title_font)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, height // 2 + 80), title,
              fill=(255, 255, 255, 255), font=title_font)

    # Subtitle
    subtitle = "울산공항 비행절차 및 실시간 항공기 추적"
    bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, height // 2 + 160), subtitle,
              fill=(200, 200, 200, 255), font=subtitle_font)

    return img.convert('RGB')

def create_screenshot(title, subtitle, color_accent=(0, 119, 190)):
    """Create a phone screenshot 1080x1920px"""
    width, height = 1080, 1920
    img = Image.new('RGBA', (width, height), (26, 26, 46, 255))
    draw = ImageDraw.Draw(img)

    # Header bar
    draw.rectangle([0, 0, width, 120], fill=color_accent)

    # Map area simulation
    draw.rectangle([40, 160, width - 40, height - 400], fill=(40, 40, 60, 255))

    # Grid lines (simulating map)
    for i in range(5):
        y = 160 + (height - 560) * i // 4
        draw.line([(40, y), (width - 40, y)], fill=(60, 60, 80, 255), width=1)
    for i in range(5):
        x = 40 + (width - 80) * i // 4
        draw.line([(x, 160), (x, height - 400)], fill=(60, 60, 80, 255), width=1)

    # Runway symbol
    runway_x = width // 2
    runway_y = height // 2 - 100
    draw.rectangle([runway_x - 100, runway_y - 10, runway_x + 100, runway_y + 10],
                   fill=(100, 100, 120, 255))
    draw.text((runway_x - 30, runway_y - 40), "RKPU", fill=(150, 150, 170, 255))

    # Airplane icons (simulating aircraft tracking)
    airplane_positions = [(300, 500), (700, 700), (500, 900), (800, 1100)]
    for ax, ay in airplane_positions:
        draw.polygon([
            (ax, ay - 20),
            (ax - 15, ay + 15),
            (ax, ay + 5),
            (ax + 15, ay + 15)
        ], fill=(255, 200, 0, 255))

    # Bottom info panel
    draw.rectangle([0, height - 350, width, height], fill=(30, 30, 50, 255))

    # Title text
    try:
        title_font = ImageFont.truetype("arial.ttf", 56)
        subtitle_font = ImageFont.truetype("arial.ttf", 32)
    except:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()

    # Title in bottom panel
    bbox = draw.textbbox((0, 0), title, font=title_font)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, height - 280), title,
              fill=(255, 255, 255, 255), font=title_font)

    # Subtitle
    bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, height - 200), subtitle,
              fill=(180, 180, 180, 255), font=subtitle_font)

    # Feature bullets
    features = ["• 실시간 항공기 추적", "• 비행절차 시각화", "• 다양한 지도 스타일"]
    y_offset = height - 130
    for feature in features:
        draw.text((width // 2 - 150, y_offset), feature,
                  fill=(150, 150, 150, 255), font=subtitle_font)
        y_offset += 40

    return img.convert('RGB')

def create_tablet_screenshot(title, subtitle, size="7inch"):
    """Create a tablet screenshot - 7inch: 1200x1920, 10inch: 1920x1200 (16:10)"""
    if size == "7inch":
        width, height = 1200, 1920  # Portrait 9:16 ratio
    else:
        width, height = 2560, 1600  # 10inch landscape 16:10

    img = Image.new('RGBA', (width, height), (26, 26, 46, 255))
    draw = ImageDraw.Draw(img)

    # Header bar
    header_height = int(height * 0.06)
    draw.rectangle([0, 0, width, header_height], fill=(0, 119, 190, 255))

    # Map area simulation
    map_margin = int(width * 0.03)
    map_bottom = int(height * 0.75)
    draw.rectangle([map_margin, header_height + 20, width - map_margin, map_bottom], fill=(40, 40, 60, 255))

    # Grid lines
    for i in range(6):
        y = header_height + 20 + (map_bottom - header_height - 20) * i // 5
        draw.line([(map_margin, y), (width - map_margin, y)], fill=(60, 60, 80, 255), width=1)
    for i in range(8):
        x = map_margin + (width - 2 * map_margin) * i // 7
        draw.line([(x, header_height + 20), (x, map_bottom)], fill=(60, 60, 80, 255), width=1)

    # Runway symbol
    runway_x = width // 2
    runway_y = (header_height + map_bottom) // 2
    draw.rectangle([runway_x - 150, runway_y - 15, runway_x + 150, runway_y + 15],
                   fill=(100, 100, 120, 255))

    # Airplane icons
    airplane_positions = [
        (int(width * 0.25), int(height * 0.25)),
        (int(width * 0.7), int(height * 0.35)),
        (int(width * 0.4), int(height * 0.5)),
        (int(width * 0.8), int(height * 0.55)),
    ]
    for ax, ay in airplane_positions:
        scale = 1.5
        draw.polygon([
            (ax, ay - int(25 * scale)),
            (ax - int(18 * scale), ay + int(18 * scale)),
            (ax, ay + int(6 * scale)),
            (ax + int(18 * scale), ay + int(18 * scale))
        ], fill=(255, 200, 0, 255))

    # Bottom info panel
    panel_top = int(height * 0.78)
    draw.rectangle([0, panel_top, width, height], fill=(30, 30, 50, 255))

    # Title text
    try:
        title_font = ImageFont.truetype("arial.ttf", int(height * 0.035))
        subtitle_font = ImageFont.truetype("arial.ttf", int(height * 0.022))
    except:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), title, font=title_font)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, panel_top + int(height * 0.03)), title,
              fill=(255, 255, 255, 255), font=title_font)

    bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, panel_top + int(height * 0.08)), subtitle,
              fill=(180, 180, 180, 255), font=subtitle_font)

    return img.convert('RGB')

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Create feature graphic
    feature = create_feature_graphic()
    feature.save(os.path.join(OUTPUT_DIR, "feature-graphic.png"), "PNG")
    print("Created feature-graphic.png (1024x500)")

    # Create phone screenshots
    screenshots = [
        ("실시간 항공기 추적", "ADS-B 기반 위치 정보"),
        ("비행절차 시각화", "SID, STAR, IAP 표시"),
        ("다양한 지도 스타일", "위성, 지형, 다크 모드"),
        ("울산공항 정보", "활주로 및 공항 시설"),
    ]

    for i, (title, subtitle) in enumerate(screenshots):
        screenshot = create_screenshot(title, subtitle)
        filename = f"screenshot-{i+1}.png"
        screenshot.save(os.path.join(OUTPUT_DIR, filename), "PNG")
        print(f"Created {filename} (1080x1920)")

    # Create 7-inch tablet screenshots
    for i, (title, subtitle) in enumerate(screenshots):
        tablet_ss = create_tablet_screenshot(title, subtitle, "7inch")
        filename = f"tablet-7inch-{i+1}.png"
        tablet_ss.save(os.path.join(OUTPUT_DIR, filename), "PNG")
        print(f"Created {filename} (1200x1920)")

    # Create 10-inch tablet screenshots
    for i, (title, subtitle) in enumerate(screenshots):
        tablet_ss = create_tablet_screenshot(title, subtitle, "10inch")
        filename = f"tablet-10inch-{i+1}.png"
        tablet_ss.save(os.path.join(OUTPUT_DIR, filename), "PNG")
        print(f"Created {filename} (2560x1600)")

    print(f"\nAll assets saved to {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()
