"""
Generate PWA icons for RKPU Viewer app
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Icon sizes needed for PWA
SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

# Output directory
OUTPUT_DIR = "public/icons"

def create_icon(size):
    """Create an aviation-themed icon for RKPU Viewer"""
    # Create image with dark blue background
    img = Image.new('RGBA', (size, size), (26, 26, 46, 255))  # #1a1a2e
    draw = ImageDraw.Draw(img)

    # Draw a circular background
    padding = int(size * 0.1)
    draw.ellipse(
        [padding, padding, size - padding, size - padding],
        fill=(0, 119, 190, 255),  # #0077be - aviation blue
        outline=(255, 255, 255, 200),
        width=max(1, size // 50)
    )

    # Draw airplane symbol (simplified)
    center_x = size // 2
    center_y = size // 2
    scale = size / 512  # Base scale for 512px

    # Airplane body
    body_width = int(20 * scale)
    body_height = int(180 * scale)
    body_top = center_y - body_height // 2
    draw.ellipse(
        [center_x - body_width, body_top,
         center_x + body_width, center_y + body_height // 2],
        fill=(255, 255, 255, 255)
    )

    # Wings
    wing_width = int(160 * scale)
    wing_height = int(40 * scale)
    wing_y = center_y - int(20 * scale)
    draw.polygon([
        (center_x - wing_width, wing_y + wing_height),
        (center_x - int(20 * scale), wing_y),
        (center_x + int(20 * scale), wing_y),
        (center_x + wing_width, wing_y + wing_height),
    ], fill=(255, 255, 255, 255))

    # Tail
    tail_width = int(60 * scale)
    tail_height = int(30 * scale)
    tail_y = body_top + int(20 * scale)
    draw.polygon([
        (center_x - tail_width, tail_y + tail_height),
        (center_x, tail_y),
        (center_x + tail_width, tail_y + tail_height),
    ], fill=(255, 255, 255, 255))

    # Add "RKPU" text for larger icons
    if size >= 128:
        try:
            font_size = int(size * 0.12)
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            font = ImageFont.load_default()

        text = "RKPU"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_x = (size - text_width) // 2
        text_y = int(size * 0.78)

        draw.text((text_x, text_y), text, fill=(255, 255, 255, 255), font=font)

    return img

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for size in SIZES:
        icon = create_icon(size)
        filename = f"icon-{size}x{size}.png"
        filepath = os.path.join(OUTPUT_DIR, filename)
        icon.save(filepath, "PNG")
        print(f"Created {filepath}")

    print("\nAll icons generated successfully!")

if __name__ == "__main__":
    main()
