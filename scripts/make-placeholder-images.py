#!/usr/bin/env python3
"""
Generates placeholder product photography for the demo product.

Draws a plausible control panel on a light studio background so the catalogue
and detail pages can be reviewed with real image dimensions and weights before
any real photography exists. Delete public/products/demo-* once you have your
own shots.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "products"
OUT.mkdir(parents=True, exist_ok=True)

W = H = 1200
BG = (246, 247, 248)
CASE = (250, 250, 249)
CASE_EDGE = (203, 208, 213)
FASCIA = (245, 197, 24)
INK = (20, 23, 26)
LCD_BG = (10, 20, 16)
LCD_TEXT = (255, 200, 60)
GREEN = (31, 122, 76)


def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def base_canvas():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # Soft floor shadow so the unit does not float.
    d.ellipse([260, 930, 940, 1010], fill=(232, 234, 237))
    return img, d


def draw_front():
    img, d = base_canvas()

    # Enclosure
    rounded(d, [250, 210, 950, 950], 18, CASE, CASE_EDGE, 3)
    # Fascia
    rounded(d, [300, 260, 900, 830], 10, FASCIA, (214, 168, 12), 2)

    # Indicator lamps
    for i, colour in enumerate([(210, 60, 50), (240, 190, 40), (60, 110, 220)]):
        cx = 380 + i * 90
        d.ellipse([cx - 18, 300, cx + 18, 336], fill=colour, outline=(90, 90, 90))
    d.ellipse([806, 300, 842, 336], fill=GREEN, outline=(90, 90, 90))

    # LCD
    rounded(d, [340, 370, 860, 500], 6, LCD_BG, (40, 40, 40), 2)
    f_lcd = font(30, bold=True)
    d.text((364, 396), "06.2 06.1 06.2  3P", font=f_lcd, fill=LCD_TEXT)
    d.text((364, 444), "415  417  416  RUN", font=f_lcd, fill=LCD_TEXT)

    # Keypad
    labels = [("MOTOR", "ON"), ("SET", ""), ("MOTOR", "OFF")]
    for i, (l1, l2) in enumerate(labels):
        x = 360 + i * 180
        colour = (40, 150, 90) if i == 0 else ((200, 60, 50) if i == 2 else (235, 235, 235))
        rounded(d, [x, 560, x + 130, 690], 8, colour, (120, 120, 120), 2)
        f = font(20, bold=True)
        tc = (255, 255, 255) if i != 1 else INK
        d.text((x + 65, 605), l1, font=f, fill=tc, anchor="mm")
        if l2:
            d.text((x + 65, 632), l2, font=f, fill=tc, anchor="mm")

    # Brand plate
    f_brand = font(30, bold=True)
    d.text((600, 760), "VKON", font=f_brand, fill=INK, anchor="mm")
    d.text((600, 796), "EC-DOL 3-10 HP", font=font(19), fill=(90, 80, 20), anchor="mm")

    # Cable gland row
    for i in range(5):
        cx = 360 + i * 120
        d.ellipse([cx - 22, 880, cx + 22, 924], fill=(60, 64, 68), outline=(35, 38, 42))

    return img


def draw_angle():
    img, d = base_canvas()
    # Simple three-quarter view: body plus a side face.
    d.polygon([(300, 250), (860, 210), (860, 900), (300, 940)], fill=CASE,
              outline=CASE_EDGE)
    d.polygon([(860, 210), (960, 270), (960, 860), (860, 900)], fill=(232, 235, 238),
              outline=CASE_EDGE)
    d.polygon([(345, 300), (820, 268), (820, 800), (345, 838)], fill=FASCIA,
              outline=(214, 168, 12))

    rounded(d, [385, 400, 780, 520], 6, LCD_BG, (40, 40, 40), 2)
    d.text((405, 424), "06.2 06.1 06.2", font=font(26, bold=True), fill=LCD_TEXT)
    d.text((405, 466), "415  417  416", font=font(26, bold=True), fill=LCD_TEXT)
    d.text((580, 720), "VKON", font=font(28, bold=True), fill=INK, anchor="mm")
    return img


def draw_terminals():
    img, d = base_canvas()
    rounded(d, [230, 330, 970, 830], 14, (238, 240, 242), CASE_EDGE, 3)
    rounded(d, [270, 370, 930, 520], 6, (52, 56, 60), (35, 38, 42), 2)

    for i in range(6):
        x = 300 + i * 105
        rounded(d, [x, 392, x + 74, 498], 4, (196, 152, 32), (140, 106, 20), 2)
        d.ellipse([x + 24, 428, x + 50, 454], fill=(70, 60, 30))

    d.text((600, 580), "L1  L2  L3   N   PE", font=font(30, bold=True),
           fill=INK, anchor="mm")
    d.text((600, 650), "3 PHASE  280-440V  50Hz", font=font(24), fill=(90, 96, 102),
           anchor="mm")
    d.text((600, 720), "CT BASED OVERLOAD", font=font(22), fill=GREEN, anchor="mm")
    return img


for name, fn in [
    ("demo-front", draw_front),
    ("demo-angle", draw_angle),
    ("demo-terminals", draw_terminals),
]:
    path = OUT / f"{name}.jpg"
    fn().save(path, "JPEG", quality=86, optimize=True)
    print(f"{path.relative_to(OUT.parent.parent)}  {path.stat().st_size // 1024} KB")
