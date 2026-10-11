"""Generate high-resolution PNG, transparent PNG, favicon, and SVG assets from user-provided MIRA logo.
"""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

SRC = Path(r"C:\Users\vastu\.gemini\antigravity-ide\brain\9a2b000d-9af6-4bf2-a44a-1c5c678a84a7\.user_uploaded\media_1791715119560.png")
DOCS_ASSETS = Path("docs/assets")
FRONTEND_PUBLIC = Path("frontend/public")

DOCS_ASSETS.mkdir(parents=True, exist_ok=True)
FRONTEND_PUBLIC.mkdir(parents=True, exist_ok=True)

# 1. Load source image
src_img = Image.open(SRC).convert("RGBA")
src_arr = np.array(src_img, dtype=np.float32)

# Estimate background color (corner pixels)
bg_color = np.median(src_arr[:30, :30, :3], axis=(0, 1))

# Compute distance from dark background
diff = src_arr[:, :, :3] - bg_color
dist = np.linalg.norm(diff, axis=2)

# Compute smooth alpha channel
alpha = np.clip((dist - 18) / (85 - 18), 0.0, 1.0) * 255.0
trans_arr = src_arr.copy()
# Preserve pure ivory/white tones for foreground
for c in range(3):
    trans_arr[:, :, c] = np.where(alpha > 10, np.clip(src_arr[:, :, c] * 1.05, 0, 255), 0)
trans_arr[:, :, 3] = alpha
trans_img = Image.fromarray(trans_arr.astype(np.uint8))

# 2. Extract emblem mark (Y: 105..355, X: 380..637)
emblem_box = (380, 105, 637, 355)
emblem_trans = trans_img.crop(emblem_box)
emblem_dark = src_img.crop(emblem_box)

# 3. Create square 512x512 mark
def make_square(img_crop, bg_hex=None, size=512, padding_pct=0.18):
    w, h = img_crop.size
    target_content_size = int(size * (1 - 2 * padding_pct))
    scale = min(target_content_size / w, target_content_size / h)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = img_crop.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    if bg_hex:
        out = Image.new("RGBA", (size, size), bg_hex)
    else:
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    offset_x = (size - new_w) // 2
    offset_y = (size - new_h) // 2
    out.paste(resized, (offset_x, offset_y), resized)
    return out

mark_dark_512 = make_square(emblem_dark, bg_hex=(11, 10, 8, 255), size=512)
mark_trans_512 = make_square(emblem_trans, bg_hex=None, size=512)

# Favicon 64x64 and apple-touch-icon 180x180
favicon_64 = mark_dark_512.resize((64, 64), Image.Resampling.LANCZOS)
apple_touch_180 = mark_dark_512.resize((180, 180), Image.Resampling.LANCZOS)

# 4. Extract SVG vector path for the emblem
sym_gray = cv2.imread(str(SRC), cv2.IMREAD_GRAYSCALE)[105:355, 380:637]
_, thresh = cv2.threshold(sym_gray, 75, 255, cv2.THRESH_BINARY)
contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_TC89_KCOS)

svg_paths = []
for c in contours:
    pts = c.reshape(-1, 2)
    # Simplify slightly to preserve smooth geometric arcs
    epsilon = 0.8
    approx = cv2.approxPolyDP(c, epsilon, True).reshape(-1, 2)
    d = f"M {approx[0][0]} {approx[0][1]} " + " ".join(f"L {p[0]} {p[1]}" for p in approx[1:]) + " Z"
    svg_paths.append(d)

mark_svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 257 250" fill="currentColor">
  <path d="{svg_paths[0]}" />
  <path d="{svg_paths[1]}" />
</svg>
'''

favicon_svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0b0a08"/>
  <g transform="translate(4.5, 4.5) scale(0.0895)" fill="#fffefd">
    <path d="{svg_paths[0]}" />
    <path d="{svg_paths[1]}" />
  </g>
</svg>
'''

# 5. Save all assets to docs/assets and frontend/public
# Original full logo
src_img.save(DOCS_ASSETS / "mira-logo.png", format="PNG")
src_img.save(FRONTEND_PUBLIC / "mira-logo.png", format="PNG")

# Transparent full logo
trans_img.save(DOCS_ASSETS / "mira-logo-transparent.png", format="PNG")
trans_img.save(FRONTEND_PUBLIC / "mira-logo-transparent.png", format="PNG")

# Square emblem marks
mark_dark_512.save(DOCS_ASSETS / "mira-mark.png", format="PNG")
mark_dark_512.save(FRONTEND_PUBLIC / "mira-mark.png", format="PNG")

mark_trans_512.save(DOCS_ASSETS / "mira-mark-transparent.png", format="PNG")
mark_trans_512.save(FRONTEND_PUBLIC / "mira-mark-transparent.png", format="PNG")

favicon_64.save(FRONTEND_PUBLIC / "favicon.png", format="PNG")
apple_touch_180.save(FRONTEND_PUBLIC / "apple-touch-icon.png", format="PNG")

# Vector SVGs
(DOCS_ASSETS / "mira-mark.svg").write_text(mark_svg_content, encoding="utf-8")
(FRONTEND_PUBLIC / "mira-mark.svg").write_text(mark_svg_content, encoding="utf-8")
(FRONTEND_PUBLIC / "favicon.svg").write_text(favicon_svg_content, encoding="utf-8")

print("Generated all MIRA logo assets successfully:")
print(" - Full logo (dark & transparent)")
print(" - Square emblem marks (512x512)")
print(" - Favicon (SVG & PNG)")
print(" - Apple touch icon (180x180)")
print(" - Vector SVGs")
