"""uyai 첫 화면 Fashion Lab 카드의 슬라이드(16:9, 원본 | 결과 한 쌍)를 쇼룸 이미지로 만든다.

쇼룸(web/fashion/assets)의 실제 생성 결과를 자르기 · 줄이기만 한다 — 색 · 내용은 바꾸지 않는다.
정사각 상품컷은 가운데를 세로 길이에 맞춰 자르고, 세로 인물 사진은 잘리지 않게 양옆을 가장자리 색으로 늘린다.
  python3 scripts/build_fashion_card.py   ->  web/media/fashion-card-{color,material,tryon}.webp
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'web/fashion/assets'
OUT = ROOT / 'web/media'
W, H, GAP = 960, 540, 8            # 16:9, 가운데 틈은 카드 미디어 바탕(--night)과 같은 색
NIGHT = (10, 18, 19)               # oklch(17.5% 0.012 205)
PAIRS = {'color': ('garment', 'color'), 'material': ('garment', 'material'), 'tryon': ('person', 'tryon')}


def half(name, w, h):
    im = Image.open(SRC / f'{name}.webp').convert('RGB')
    s = h / im.height
    im = im.resize((round(im.width * s), h), Image.LANCZOS)
    if im.width >= w:                                   # 정사각 상품컷 - 가운데만
        x = (im.width - w) // 2
        return im.crop((x, 0, x + w, h))
    out = Image.new('RGB', (w, h))                      # 세로 인물 - 양옆을 가장자리 한 줄로 늘려 잇는다
    x = (w - im.width) // 2
    out.paste(im.crop((0, 0, 1, h)).resize((x, h)), (0, 0))
    out.paste(im.crop((im.width - 1, 0, im.width, h)).resize((w - x - im.width, h)), (x + im.width, 0))
    out.paste(im, (x, 0))
    return out


def main():
    hw = (W - GAP) // 2
    for key, (left, right) in PAIRS.items():
        card = Image.new('RGB', (W, H), NIGHT)
        card.paste(half(left, hw, H), (0, 0))
        card.paste(half(right, W - GAP - hw, H), (hw + GAP, 0))
        dest = OUT / f'fashion-card-{key}.webp'
        card.save(dest, 'WEBP', quality=82, method=6)
        print(dest.relative_to(ROOT), dest.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
