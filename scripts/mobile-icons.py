# Иконки и заставки мобильного приложения и сайта из файлов mobile/resources (логотип OptoLink):
#   icon.png        1024×1024 без прозрачности — основная иконка (iOS, старый Android, PWA)
#   foreground.png  1024×1024 прозрачный — знак для адаптивной иконки Android (в безопасной зоне ~60%)
#   monochrome.png  1024×1024 прозрачный — одноцветный знак для тематических иконок Android 13+
#   splash-mark.png 1024×1024 прозрачный — знак на заставке
# Исходники логотипа (SVG) — в public/brand. После замены файлов запустите  python3 scripts/mobile-icons.py
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..")
RES = os.path.join(ROOT, "mobile", "resources")
BRAND = (91, 63, 214)  # #5B3FD6 — фиолетовый OptoLink
BRAND_HEX = "#5B3FD6"


def load(name):
    return Image.open(os.path.join(RES, name)).convert("RGBA").resize((1024, 1024), Image.LANCZOS)


def save(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path)


def splash(w, h, mark_size):
    img = Image.new("RGB", (w, h), BRAND)
    m = mark.resize((mark_size, mark_size), Image.LANCZOS)
    img.paste(m, ((w - mark_size) // 2, (h - mark_size) // 2), m)
    return img


icon = load("icon.png")
fg = load("foreground.png")
mono = load("monochrome.png")
mark = load("splash-mark.png")

android = os.path.join(ROOT, "mobile", "android", "app", "src", "main", "res")
for dpi, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    save(icon, f"{android}/mipmap-{dpi}/ic_launcher.png", px)
    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px - 1, px - 1), fill=255)
    rnd = icon.resize((px, px), Image.LANCZOS)
    rnd.putalpha(mask)
    rnd.save(f"{android}/mipmap-{dpi}/ic_launcher_round.png")
    save(fg, f"{android}/mipmap-{dpi}/ic_launcher_foreground.png", int(px * 2.25))
    save(mono, f"{android}/mipmap-{dpi}/ic_launcher_monochrome.png", int(px * 2.25))
with open(f"{android}/values/ic_launcher_background.xml", "w") as f:
    f.write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{BRAND_HEX}</color>\n</resources>\n')

# Заставка Android: знак на фиолетовом фоне
for name in os.listdir(android):
    if name.startswith("drawable") and os.path.exists(f"{android}/{name}/splash.png"):
        w, h = Image.open(f"{android}/{name}/splash.png").size
        splash(w, h, min(w, h) * 2 // 5).save(f"{android}/{name}/splash.png")

ios = os.path.join(ROOT, "mobile", "ios", "App", "App", "Assets.xcassets")
icon.convert("RGB").save(f"{ios}/AppIcon.appiconset/AppIcon-512@2x.png")  # App Store: без прозрачности
s = splash(2732, 2732, 800)
for n in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]:
    s.save(f"{ios}/Splash.imageset/{n}")

save(icon, os.path.join(ROOT, "public", "icon-512.png"), 512)
save(icon, os.path.join(ROOT, "public", "icon-192.png"), 192)
print("Иконки обновлены")
