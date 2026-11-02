# Иконки и заставка мобильного приложения из mobile/resources/icon.png (1024×1024).
# Своя иконка: положите icon.png в mobile/resources и запустите  python3 scripts/mobile-icons.py
# Без файла рисуется временная иконка «коробка» в фирменном синем цвете.
import json
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..")
RES = os.path.join(ROOT, "mobile", "resources")
BLUE = (31, 90, 214)
WHITE = (255, 255, 255)


def draw_mark(size, scale=1.0, bg=BLUE):
    img = Image.new("RGBA", (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size * 0.46 * scale
    cx = cy = size / 2
    box = (cx - s / 2, cy - s / 2 + s * 0.04, cx + s / 2, cy + s / 2 + s * 0.04)
    d.rounded_rectangle(box, radius=s * 0.1, fill=WHITE)
    lid = (box[0] - s * 0.05, box[1] - s * 0.02, box[2] + s * 0.05, box[1] + s * 0.24)
    d.rounded_rectangle(lid, radius=s * 0.08, fill=WHITE, outline=BLUE, width=max(2, int(s * 0.035)))
    tape = (cx - s * 0.09, lid[1], cx + s * 0.09, box[1] + s * 0.5)
    d.rectangle(tape, fill=BLUE)
    return img


def master():
    path = os.path.join(RES, "icon.png")
    if os.path.exists(path):
        return Image.open(path).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    img = draw_mark(1024)
    os.makedirs(RES, exist_ok=True)
    img.save(path)
    return img


def save(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path)


icon = master()
custom = os.path.exists(os.path.join(RES, "foreground.png"))
fg = Image.open(os.path.join(RES, "foreground.png")).convert("RGBA").resize((1024, 1024)) if custom else draw_mark(1024, 0.62, None)

android = os.path.join(ROOT, "mobile", "android", "app", "src", "main", "res")
for dpi, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    save(icon, f"{android}/mipmap-{dpi}/ic_launcher.png", px)
    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px - 1, px - 1), fill=255)
    rnd = icon.resize((px, px), Image.LANCZOS)
    rnd.putalpha(mask)
    rnd.save(f"{android}/mipmap-{dpi}/ic_launcher_round.png")
    save(fg, f"{android}/mipmap-{dpi}/ic_launcher_foreground.png", int(px * 2.25))
with open(f"{android}/values/ic_launcher_background.xml", "w") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1F5AD6</color>\n</resources>\n')

# Заставка Android: логотип на синем фоне
for name in os.listdir(android):
    if name.startswith("drawable") and os.path.exists(f"{android}/{name}/splash.png"):
        w, h = Image.open(f"{android}/{name}/splash.png").size
        splash = Image.new("RGB", (w, h), BLUE)
        m = draw_mark(min(w, h) // 2, 1.0, BLUE).convert("RGB")
        splash.paste(m, ((w - m.width) // 2, (h - m.height) // 2))
        splash.save(f"{android}/{name}/splash.png")

ios = os.path.join(ROOT, "mobile", "ios", "App", "App", "Assets.xcassets")
icon.convert("RGB").save(f"{ios}/AppIcon.appiconset/AppIcon-512@2x.png")  # App Store: без прозрачности
splash = Image.new("RGB", (2732, 2732), BLUE)
m = draw_mark(900, 1.0, BLUE).convert("RGB")
splash.paste(m, ((2732 - 900) // 2, (2732 - 900) // 2))
for n in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]:
    splash.save(f"{ios}/Splash.imageset/{n}")

save(icon, os.path.join(ROOT, "public", "icon-512.png"), 512)
save(icon, os.path.join(ROOT, "public", "icon-192.png"), 192)
print("Иконки обновлены")
