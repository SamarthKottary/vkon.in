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


# ---------------------------------------------------------------------------
# One placeholder per category, so a test catalogue has visually distinct
# products rather than the same panel five times. Same drawing, different
# fascia colour and plate text — except cable, which gets a coil, because a
# control panel filed under "Cables" is confusing even in test data.
# ---------------------------------------------------------------------------

def draw_category_panel(fascia, model, sub):
    img, d = base_canvas()
    rounded(d, [250, 210, 950, 950], 18, CASE, CASE_EDGE, 3)
    edge = tuple(max(0, c - 40) for c in fascia)
    rounded(d, [300, 260, 900, 830], 10, fascia, edge, 2)

    for i, colour in enumerate([(210, 60, 50), (240, 190, 40), (60, 110, 220)]):
        cx = 380 + i * 90
        d.ellipse([cx - 18, 300, cx + 18, 336], fill=colour, outline=(90, 90, 90))
    d.ellipse([806, 300, 842, 336], fill=GREEN, outline=(90, 90, 90))

    rounded(d, [340, 370, 860, 500], 6, LCD_BG, (40, 40, 40), 2)
    d.text((364, 396), "06.2 06.1 06.2  3P", font=font(30, bold=True), fill=LCD_TEXT)
    d.text((364, 444), "415  417  416  RUN", font=font(30, bold=True), fill=LCD_TEXT)

    for i, (l1, l2) in enumerate([("MOTOR", "ON"), ("SET", ""), ("MOTOR", "OFF")]):
        x = 360 + i * 180
        colour = (40, 150, 90) if i == 0 else ((200, 60, 50) if i == 2 else (235, 235, 235))
        rounded(d, [x, 560, x + 130, 690], 8, colour, (120, 120, 120), 2)
        tc = (255, 255, 255) if i != 1 else INK
        d.text((x + 65, 605), l1, font=font(20, bold=True), fill=tc, anchor="mm")
        if l2:
            d.text((x + 65, 632), l2, font=font(20, bold=True), fill=tc, anchor="mm")

    d.text((600, 760), "VKON", font=font(30, bold=True), fill=INK, anchor="mm")
    d.text((600, 796), model, font=font(19), fill=INK, anchor="mm")
    d.text((600, 1040), sub, font=font(22), fill=(150, 156, 162), anchor="mm")

    for i in range(5):
        cx = 360 + i * 120
        d.ellipse([cx - 22, 880, cx + 22, 924], fill=(60, 64, 68), outline=(35, 38, 42))
    return img


def draw_cable():
    img, d = base_canvas()
    for ring in range(5):
        inset = ring * 26
        d.ellipse([300 + inset, 300 + inset, 900 - inset, 900 - inset],
                  outline=(48, 52, 56), width=16)
    d.ellipse([470, 470, 730, 730], fill=BG)
    d.line([(880, 600), (1010, 640)], fill=(48, 52, 56), width=26)
    d.line([(1000, 636), (1030, 644)], fill=(196, 152, 32), width=18)
    d.text((600, 1040), "PLACEHOLDER", font=font(22), fill=(150, 156, 162), anchor="mm")
    return img


def draw_light_module(label):
    """A sensor-and-strip module, for the commercial (home automation) demos.

    A control panel filed under "Home Automation" would be as confusing as one
    filed under "Cables", so these get their own drawing: a small enclosure with
    a PIR dome, and a lit strip below it.
    """
    # Its own canvas rather than `base_canvas()`: that one draws a floor shadow
    # under a full-height enclosure, and this module is half the height, so the
    # shadow landed 200px clear of it.
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.ellipse([300, 700, 900, 760], fill=(232, 234, 237))

    # Module body
    rounded(d, [300, 300, 900, 560], 16, CASE, CASE_EDGE, 3)
    # PIR dome
    d.ellipse([540, 340, 660, 460], fill=(238, 240, 242), outline=(180, 186, 192), width=3)
    d.ellipse([566, 366, 634, 434], fill=(210, 214, 218), outline=(170, 176, 182), width=2)
    # Status lamp and label
    d.ellipse([340, 384, 376, 420], fill=GREEN, outline=(90, 90, 90))
    d.text((600, 512), "VKON", font=font(26, bold=True), fill=INK, anchor="mm")

    # Lit strip, warm falling off to either end.
    for i in range(60):
        x = 300 + i * 10
        fade = 1 - abs(i - 29.5) / 34
        warm = tuple(int(c) for c in (255 * fade + 240 * (1 - fade),
                                      226 * fade + 240 * (1 - fade),
                                      170 * fade + 242 * (1 - fade)))
        d.rectangle([x, 640, x + 10, 700], fill=warm)
    rounded(d, [300, 640, 900, 700], 8, None, CASE_EDGE, 3)

    d.text((600, 790), label, font=font(24, bold=True), fill=INK, anchor="mm")
    d.text((600, 1040), "PLACEHOLDER", font=font(22), fill=(150, 156, 162), anchor="mm")
    return img


CATEGORY_ART = [
    ("demo-starter", lambda: draw_category_panel(FASCIA, "EC-DOL 3-10 HP", "PLACEHOLDER")),
    ("demo-solar", lambda: draw_category_panel((70, 120, 190), "SOLAR MPPT 5 HP", "PLACEHOLDER")),
    ("demo-auto-start", lambda: draw_category_panel((236, 236, 238), "AUTO START TIMER", "PLACEHOLDER")),
    ("demo-accessory", lambda: draw_category_panel((120, 190, 150), "GSM MOBILE CONTROL", "PLACEHOLDER")),
    ("demo-cable", draw_cable),
    ("demo-industrial", lambda: draw_category_panel((92, 100, 108), "INDUSTRIAL DOL 25 HP", "PLACEHOLDER")),
    ("demo-wardrobe-light", lambda: draw_light_module("WARDROBE AUTO LIGHT")),
    ("demo-staircase-light", lambda: draw_light_module("STAIRCASE AUTO LIGHT")),
]


for name, fn in [
    ("demo-front", draw_front),
    ("demo-angle", draw_angle),
    ("demo-terminals", draw_terminals),
    *CATEGORY_ART,
]:
    path = OUT / f"{name}.jpg"
    fn().save(path, "JPEG", quality=86, optimize=True)
    print(f"{path.relative_to(OUT.parent.parent)}  {path.stat().st_size // 1024} KB")
