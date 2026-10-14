"""Generate the ToonStudio self-authored CC0 environment pack v1.

Replacement for the retired Tripo free-wallet pack (``mcp-free-v1``). Every
asset in this pack is original procedural geometry authored by this script:
boxes, cylinders, and gable prisms composed per scene, flat PBR materials
with authored colours, no textures, no external models, no network resources.
ToonStudio dedicates the outputs to the public domain under CC0-1.0.

The asset IDs and file names intentionally match the retired pack so saved
projects that resolve environments through the catalog keep working; only
the provenance, the directory, and the bytes change.

Requirements: Python 3.11+ and numpy (thumbnails + geometry math only).
Outputs: self-contained GLB 2.0 files (metres, glTF Y-up, grounded at Y=0),
960x720 PNG thumbnails rendered from the same geometry by the built-in
software rasteriser, and ``manifest.json`` with SHA-256 hashes.

Example:
  python3 scripts/generate_self_authored_environment_pack_v1.py \
    --output-dir apps/web/public/assets/3d/environments/authored-v1
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

GENERATOR = "scripts/generate_self_authored_environment_pack_v1.py"
GENERATOR_VERSION = "1.0.0-python"
PACK_VERSION = "authored-v1"
CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/"

# Palette (authored colours, sRGB hex)
CONCRETE = "#b8b4ac"
CONCRETE_DARK = "#8f8b84"
STEEL = "#5c6670"
STEEL_LIGHT = "#9fb2bd"
GLASS = "#a8c8d8"
WOOD = "#9a6b42"
WOOD_DARK = "#6e4a2c"
BRICK = "#a15c48"
WHITE = "#eef0ea"
CHARCOAL = "#3c4147"
ROOF_TILE = "#4a4f57"
ACCENT_RED = "#c0453a"
ACCENT_BLUE = "#3a6ea5"
ACCENT_GREEN = "#5d8a5a"
ACCENT_YELLOW = "#e0b84f"
FABRIC = "#7a9e7e"
GROUND = "#a9a49a"
GROUND_GREEN = "#7d9b6a"


def box(cx, cy, cz, sx, sy, sz, color, rot_y=0.0, name="box"):
    return {"shape": "box", "c": (cx, cy, cz), "s": (sx, sy, sz),
            "color": color, "rot": rot_y, "name": name}


def cyl(cx, cy, cz, r, h, color, rot_z=0.0, seg=14, name="cylinder"):
    return {"shape": "cyl", "c": (cx, cy, cz), "s": (r, h),
            "color": color, "rot": rot_z, "seg": seg, "name": name}


def gable(cx, cy, cz, sx, sy, sz, color, name="gable"):
    """Triangular prism: ridge runs along X, base centred at (cx, cy, cz)."""
    return {"shape": "gable", "c": (cx, cy, cz), "s": (sx, sy, sz),
            "color": color, "rot": 0.0, "name": name}


# ---------------------------------------------------------------- scenes
# Each scene: parts list built from primitives only. y values are centres;
# ground slabs sit with their top at y=0.12 unless noted.

def scene_bus_stop():
    p = [box(0, 0.06, 0, 4.4, 0.12, 1.9, CONCRETE, name="platform slab"),
         box(0, 0.14, 0.72, 4.4, 0.05, 0.28, ACCENT_YELLOW, name="tactile strip")]
    for x in (-1.9, 0.0, 1.9):
        p.append(box(x, 1.3, -0.62, 0.09, 2.5, 0.09, STEEL, name="shelter post"))
    p += [box(0, 2.62, -0.35, 4.3, 0.1, 1.15, ACCENT_BLUE, name="shelter roof"),
          box(0, 1.45, -0.68, 4.1, 1.5, 0.04, GLASS, name="glass back panel"),
          box(0, 0.78, -0.68, 4.1, 0.16, 0.05, STEEL, name="glass lower rail")]
    for x in (-1.2, 0.0, 1.2):
        p.append(box(x, 0.52, -0.35, 0.08, 0.5, 0.08, STEEL, name="bench leg"))
    p += [box(0, 0.78, -0.33, 3.4, 0.07, 0.42, WOOD, name="wood bench seat"),
          box(0, 1.06, -0.52, 3.4, 0.3, 0.06, WOOD, name="bench backrest"),
          cyl(2.45, 1.15, 0.55, 0.045, 2.3, STEEL, name="sign pole"),
          box(2.45, 2.18, 0.55, 0.72, 0.5, 0.05, ACCENT_BLUE, name="route sign"),
          box(2.45, 2.18, 0.59, 0.6, 0.38, 0.02, WHITE, name="route board face")]
    for x in (-2.35, 2.95):
        p.append(cyl(x, 0.4, 0.85, 0.07, 0.8, CHARCOAL, name="bollard"))
    return p


def scene_school_gate():
    p = [box(0, 0.05, 0, 9.2, 0.1, 1.6, CONCRETE, name="gate apron")]
    for x in (-1.7, 1.7):
        p += [box(x, 1.5, 0, 0.55, 2.8, 0.55, BRICK, name="brick pillar"),
              box(x, 3.0, 0, 0.75, 0.22, 0.75, CONCRETE, name="pillar cap")]
    p += [box(0, 3.25, 0, 4.6, 0.35, 0.3, CONCRETE_DARK, name="gate beam"),
          box(0, 3.25, 0.18, 3.4, 0.26, 0.04, ACCENT_BLUE, name="school name board")]
    for i in range(5):
        p.append(box(-0.95 + i * 0.48, 1.05, 0, 0.06, 1.9, 0.06, STEEL, name="gate bar"))
        p.append(box(0.55 + i * 0.48, 1.05, 0, 0.06, 1.9, 0.06, STEEL, name="gate bar"))
    p += [box(0, 1.95, 0, 2.9, 0.07, 0.07, STEEL, name="gate top rail"),
          box(0, 0.25, 0, 2.9, 0.07, 0.07, STEEL, name="gate bottom rail")]
    for side in (-1, 1):
        for i in range(4):
            p.append(box(side * (2.35 + i * 0.85), 0.95, 0, 0.09, 1.7, 0.09, CONCRETE_DARK, name="fence post"))
        p.append(box(side * 3.65, 1.55, 0, 3.5, 0.1, 0.06, CONCRETE_DARK, name="fence rail"))
        p.append(box(side * 3.65, 0.75, 0, 3.5, 0.55, 0.05, CONCRETE, name="fence panel"))
    return p


def scene_rooftop_stairwell():
    p = [box(0, 0.06, 0, 5.6, 0.12, 4.6, CONCRETE, name="rooftop slab"),
         box(-0.9, 1.45, -0.7, 2.6, 2.7, 2.0, WHITE, name="stairwell block"),
         box(-0.9, 2.32, 0.36, 1.0, 0.85, 0.06, GLASS, name="stairwell window"),
         box(-0.35, 1.05, 0.33, 0.85, 1.9, 0.07, ACCENT_RED, name="fire door"),
         box(-0.35, 2.14, 0.48, 1.3, 0.08, 0.5, STEEL, name="door canopy"),
         cyl(0.55, 2.9, -1.2, 0.16, 0.7, STEEL_LIGHT, name="vent stack"),
         cyl(1.6, 0.55, -1.5, 0.3, 0.9, STEEL_LIGHT, name="duct drum"),
         box(1.7, 0.5, 0.9, 1.1, 0.75, 0.7, STEEL_LIGHT, name="outdoor unit"),
         box(1.7, 0.95, 0.9, 1.1, 0.12, 0.7, CHARCOAL, name="unit fan grille")]
    for x in (-2.7, -1.35, 0.0, 1.35, 2.7):
        p.append(box(x, 0.65, 2.22, 0.06, 1.1, 0.06, STEEL, name="railing post"))
        p.append(box(x, 0.65, -2.22, 0.06, 1.1, 0.06, STEEL, name="railing post"))
    p += [box(0, 1.18, 2.22, 5.5, 0.06, 0.06, STEEL, name="railing top rail"),
          box(0, 1.18, -2.22, 5.5, 0.06, 0.06, STEEL, name="railing top rail"),
          box(0, 0.65, 2.22, 5.5, 0.05, 0.05, STEEL, name="railing mid rail"),
          box(0, 0.65, -2.22, 5.5, 0.05, 0.05, STEEL, name="railing mid rail")]
    return p


def scene_food_cart():
    p = [box(0, 0.03, 0, 3.0, 0.06, 2.2, GROUND, name="alley ground patch"),
         box(0, 0.75, 0, 1.9, 0.95, 0.85, STEEL_LIGHT, name="cart body"),
         box(0, 1.28, 0, 2.0, 0.08, 0.95, CHARCOAL, name="cooking counter"),
         cyl(-0.7, 0.28, 0.5, 0.28, 0.1, CHARCOAL, rot_z=90, name="cart wheel"),
         cyl(0.7, 0.28, 0.5, 0.28, 0.1, CHARCOAL, rot_z=90, name="cart wheel"),
         cyl(-0.7, 0.28, -0.5, 0.28, 0.1, CHARCOAL, rot_z=90, name="cart wheel"),
         cyl(0.7, 0.28, -0.5, 0.28, 0.1, CHARCOAL, rot_z=90, name="cart wheel")]
    for x in (-0.95, 0.95):
        for z in (-0.45, 0.45):
            p.append(cyl(x, 1.95, z, 0.035, 1.5, STEEL, name="canopy pole"))
    p += [box(0, 2.78, 0, 2.5, 0.08, 1.5, ACCENT_RED, name="red canopy"),
          box(-0.45, 1.45, 0.1, 0.5, 0.28, 0.5, STEEL, name="steamer pot"),
          cyl(0.35, 1.42, 0.05, 0.16, 0.22, STEEL, name="stock pot"),
          box(0.75, 1.4, -0.15, 0.4, 0.16, 0.3, ACCENT_YELLOW, name="display tray")]
    for i, x in enumerate((-0.8, 0.0, 0.8)):
        p += [cyl(x, 0.25, 1.05, 0.19, 0.06, ACCENT_RED, name="stool seat"),
              cyl(x, 0.12, 1.05, 0.03, 0.22, STEEL, name="stool leg")]
    p += [box(-1.45, 0.3, -0.7, 0.5, 0.55, 0.5, WOOD, name="crate"),
          box(-1.45, 0.85, -0.7, 0.44, 0.5, 0.44, WOOD_DARK, name="crate top"),
          cyl(1.5, 2.9, 0, 0.05, 0.5, STEEL, name="lamp arm"),
          box(1.5, 3.2, 0, 0.22, 0.12, 0.22, ACCENT_YELLOW, name="hanging lamp")]
    return p


def scene_one_room():
    p = [box(0, 0.04, 0, 3.6, 0.08, 3.4, WOOD, name="floor"),
         box(0.2, 0.1, 0.3, 2.2, 0.03, 1.6, FABRIC, name="rug"),
         box(-1.05, 0.3, -0.95, 1.1, 0.35, 2.0, WHITE, name="bed base"),
         box(-1.05, 0.52, -0.95, 1.05, 0.14, 1.95, ACCENT_BLUE, name="bedding"),
         box(-1.05, 0.62, -1.75, 0.9, 0.12, 0.4, WHITE, name="pillow"),
         box(-1.6, 0.75, -0.95, 0.08, 1.0, 2.0, WOOD_DARK, name="headboard"),
         box(0.95, 0.45, -1.25, 1.5, 0.06, 0.65, WOOD, name="desk top")]
    for x in (0.3, 1.6):
        p.append(box(x, 0.22, -1.25, 0.06, 0.42, 0.6, WOOD_DARK, name="desk leg"))
    p += [box(0.95, 0.3, -0.55, 0.45, 0.08, 0.45, CHARCOAL, name="chair seat"),
          box(0.95, 0.62, -0.36, 0.45, 0.6, 0.07, CHARCOAL, name="chair back"),
          box(1.55, 1.05, -1.45, 0.5, 2.0, 0.45, WOOD_DARK, name="wardrobe"),
          box(-0.2, 0.95, -1.5, 0.9, 1.8, 0.3, WOOD, name="bookshelf")]
    for i in range(3):
        p.append(box(-0.2, 0.45 + i * 0.5, -1.48, 0.8, 0.05, 0.26, WOOD_DARK, name="shelf board"))
        for j in range(3):
            p.append(box(-0.5 + j * 0.28, 0.6 + i * 0.5, -1.48, 0.09, 0.24, 0.18,
                         [ACCENT_RED, ACCENT_YELLOW, ACCENT_GREEN][j], name="book"))
    p += [cyl(1.55, 0.75, 0.9, 0.16, 0.05, STEEL, name="lamp base"),
          cyl(1.55, 1.05, 0.9, 0.025, 0.6, STEEL, name="lamp stem"),
          cyl(1.55, 1.45, 0.9, 0.16, 0.22, ACCENT_YELLOW, name="lamp shade"),
          box(-1.3, 0.35, 1.25, 0.7, 0.55, 0.5, STEEL_LIGHT, name="mini fridge")]
    return p


def scene_apartment_lobby():
    p = [box(0, 0.05, 0, 4.6, 0.1, 2.6, CONCRETE, name="lobby floor"),
         box(0, 1.7, -1.05, 4.6, 3.3, 0.18, WHITE, name="back wall"),
         box(-1.15, 1.55, -0.9, 1.05, 2.9, 0.1, STEEL_LIGHT, name="elevator door left"),
         box(0.0, 1.55, -0.9, 1.05, 2.9, 0.1, STEEL_LIGHT, name="elevator door right"),
         box(-0.58, 3.15, -0.88, 2.3, 0.12, 0.1, CHARCOAL, name="elevator header"),
         box(1.55, 1.5, -0.92, 1.15, 2.8, 0.08, GLASS, name="glass entrance door"),
         box(1.55, 2.98, -0.9, 1.3, 0.14, 0.1, ACCENT_BLUE, name="entrance sign")]
    # parcel locker bank on the left wall side
    for r in range(3):
        for c in range(3):
            p.append(box(-1.9, 0.55 + r * 0.55, 0.3 + c * 0.52, 0.5, 0.5, 0.45, ACCENT_GREEN, name="parcel locker"))
    p += [box(1.2, 0.35, 0.9, 1.6, 0.1, 0.45, WOOD, name="bench"),
          cyl(-0.6, 0.3, 1.0, 0.22, 0.5, BRICK, name="plant pot"),
          cyl(-0.6, 0.75, 1.0, 0.3, 0.45, ACCENT_GREEN, name="plant foliage"),
          box(2.05, 1.7, -0.85, 0.55, 0.9, 0.06, WHITE, name="notice board")]
    return p


def scene_hanok_gate():
    p = [box(0, 0.09, 0, 5.4, 0.18, 1.4, CONCRETE_DARK, name="stone threshold"),
         box(-1.35, 1.35, 0, 0.28, 2.7, 0.28, WOOD_DARK, name="wood pillar"),
         box(1.35, 1.35, 0, 0.28, 2.7, 0.28, WOOD_DARK, name="wood pillar"),
         box(0, 2.62, 0, 3.6, 0.24, 0.34, WOOD_DARK, name="top beam"),
         gable(0, 3.15, 0, 4.3, 0.85, 1.5, ROOF_TILE, name="tile roof"),
         box(0, 3.62, 0, 4.4, 0.12, 0.24, CHARCOAL, name="ridge beam"),
         box(-0.62, 1.15, 0, 1.15, 2.1, 0.09, WOOD, name="gate door left"),
         box(0.62, 1.15, 0, 1.15, 2.1, 0.09, WOOD, name="gate door right")]
    for gx in (-0.62, 0.62):
        for i in range(3):
            p.append(box(gx, 0.55 + i * 0.6, 0.07, 0.95, 0.07, 0.03, WOOD_DARK, name="lattice bar"))
    for side in (-1, 1):
        p += [box(side * 2.6, 0.85, 0, 1.9, 1.5, 0.22, CONCRETE, name="courtyard wall"),
              gable(side * 2.6, 1.85, 0, 2.1, 0.5, 0.55, ROOF_TILE, name="wall cap tiles"),
              cyl(side * 3.3, 0.35, 0.75, 0.26, 0.7, BRICK, name="onggi jar"),
              cyl(side * 2.95, 0.28, 0.85, 0.2, 0.55, BRICK, name="onggi jar small")]
    return p


def scene_convenience_fixtures():
    p = [box(0, 0.04, 0, 4.2, 0.08, 3.0, CONCRETE, name="store floor")]
    for sx in (-1.35, 0.0):
        p.append(box(sx, 0.85, -0.8, 1.1, 1.6, 0.5, WHITE, name="shelf unit"))
        for r in range(3):
            p.append(box(sx, 0.35 + r * 0.5, -0.52, 1.05, 0.05, 0.06, STEEL, name="shelf edge"))
            for j in range(4):
                p.append(box(sx - 0.38 + j * 0.26, 0.5 + r * 0.5, -0.78, 0.16, 0.24, 0.3,
                             [ACCENT_RED, ACCENT_YELLOW, ACCENT_BLUE, ACCENT_GREEN][(j + r) % 4],
                             name="product box"))
    p += [box(1.45, 1.0, -0.8, 0.9, 1.9, 0.6, STEEL_LIGHT, name="drinks fridge"),
          box(1.45, 1.05, -0.48, 0.75, 1.6, 0.04, GLASS, name="fridge glass"),
          box(0.9, 0.55, 0.95, 2.2, 1.0, 0.7, WHITE, name="checkout counter"),
          box(0.9, 1.1, 0.95, 2.2, 0.08, 0.7, ACCENT_BLUE, name="counter top"),
          box(1.7, 1.3, 0.85, 0.45, 0.3, 0.35, CHARCOAL, name="register"),
          box(-1.5, 0.65, 0.9, 0.8, 1.2, 0.4, WHITE, name="microwave shelf unit"),
          box(-1.5, 0.95, 0.9, 0.6, 0.35, 0.32, STEEL_LIGHT, name="microwave"),
          cyl(-0.2, 0.35, 1.15, 0.24, 0.7, ACCENT_GREEN, name="recycle bin"),
          cyl(2.0, 0.3, 1.1, 0.2, 0.06, ACCENT_RED, name="basket stack")]
    return p


def scene_police_box():
    p = [box(0, 0.05, 0, 5.2, 0.1, 3.4, CONCRETE, name="forecourt"),
         box(0, 1.5, -0.6, 4.2, 2.9, 2.2, WHITE, name="station body"),
         box(0, 3.1, -0.6, 4.6, 0.3, 2.6, ACCENT_BLUE, name="roof band"),
         box(0, 3.32, -0.6, 3.2, 0.16, 1.6, CHARCOAL, name="roof cap"),
         box(-0.7, 1.25, 0.56, 1.0, 2.3, 0.08, GLASS, name="glass entrance"),
         box(0.55, 1.35, 0.56, 0.95, 1.15, 0.08, GLASS, name="front window"),
         box(-0.7, 2.62, 0.6, 1.6, 0.35, 0.06, ACCENT_BLUE, name="station sign"),
         box(-0.7, 0.16, 0.95, 1.4, 0.12, 0.7, CONCRETE_DARK, name="entrance step"),
         box(1.85, 1.9, 0.4, 0.5, 0.7, 0.3, STEEL_LIGHT, name="security camera box"),
         cyl(2.3, 0.45, 1.2, 0.04, 0.9, STEEL, name="bike rack post"),
         cyl(1.7, 0.45, 1.2, 0.04, 0.9, STEEL, name="bike rack post"),
         box(2.0, 0.85, 1.2, 0.7, 0.05, 0.05, STEEL, name="bike rack rail"),
         box(-1.9, 0.3, 1.25, 0.9, 0.4, 0.5, WOOD_DARK, name="planter"),
         cyl(-1.9, 0.65, 1.25, 0.3, 0.35, ACCENT_GREEN, name="planter shrub")]
    return p


def scene_park_pavilion():
    p = [box(0, 0.07, 0, 4.8, 0.14, 4.2, WOOD, name="deck"),
         box(0, 0.02, 0, 5.6, 0.04, 5.0, GROUND_GREEN, name="grass apron")]
    for x in (-1.9, 1.9):
        for z in (-1.5, 1.5):
            p.append(cyl(x, 1.35, z, 0.09, 2.6, WOOD_DARK, name="pavilion post"))
    p += [box(0, 2.78, 0, 5.0, 0.14, 4.3, STEEL, name="roof frame"),
          gable(0, 3.25, 0, 5.2, 0.9, 4.5, ACCENT_GREEN, name="pavilion roof"),
          box(0, 3.78, 0, 5.3, 0.1, 0.3, CHARCOAL, name="ridge cap"),
          box(0, 0.55, 0, 1.8, 0.08, 0.8, WOOD, name="picnic table top")]
    for x in (-0.75, 0.75):
        p.append(box(x, 0.28, 0, 0.09, 0.5, 0.7, WOOD_DARK, name="table leg"))
    for z in (-0.85, 0.85):
        p.append(box(0, 0.42, z, 1.8, 0.07, 0.3, WOOD, name="picnic bench"))
    p += [cyl(2.9, 0.4, 1.6, 0.14, 0.8, STEEL, name="drinking fountain"),
          cyl(-2.9, 0.35, 1.4, 0.04, 0.7, STEEL, name="bike rack post"),
          cyl(-2.4, 0.35, 1.4, 0.04, 0.7, STEEL, name="bike rack post"),
          box(-2.65, 0.68, 1.4, 0.6, 0.05, 0.05, STEEL, name="bike rack rail"),
          box(0, 0.5, -1.95, 4.4, 0.07, 0.25, WOOD, name="deck bench")]
    return p


ASSETS = [
    {"slug": "webtoon_neighborhood_bus_stop", "id": "ts-bg3d-webtoon_neighborhood_bus_stop-mcp-v1",
     "name": "웹툰 동네 버스 정류장", "theme": "transit",
     "description": "유리 패널·목재 벤치·노선 안내판·안전 볼라드와 낮은 승강장 기단이 결합된 한국형 동네 정류장 모듈",
     "tags": ["webtoon", "bus stop", "shelter", "bench", "transit", "웹툰", "버스 정류장", "벤치", "교통"],
     "build": scene_bus_stop,
     "parts": ["platform slab", "glass shelter", "wood bench", "route sign", "bollards"]},
    {"slug": "webtoon_school_gate_module", "id": "ts-bg3d-webtoon_school_gate_module-mcp-v1",
     "name": "웹툰 한국 학교 정문", "theme": "education",
     "description": "석재·벽돌 문주, 슬라이딩 철문, 보행자 출입구와 담장 날개를 묶은 학교 정문 배경 모듈",
     "tags": ["webtoon", "school", "gate", "education", "korea", "웹툰", "학교", "정문", "담장"],
     "build": scene_school_gate,
     "parts": ["brick pillars", "steel sliding gate", "name board", "fence wings"]},
    {"slug": "webtoon_rooftop_stairwell_entry", "id": "ts-bg3d-webtoon_rooftop_stairwell_entry-mcp-v1",
     "name": "웹툰 학교 옥상 계단실", "theme": "education",
     "description": "방화문·차양·배관·환기 설비와 옥상 안전 난간이 결합된 한국 학교 옥상 계단실 모듈",
     "tags": ["webtoon", "school", "rooftop", "stairwell", "utility", "웹툰", "학교", "옥상", "계단실"],
     "build": scene_rooftop_stairwell,
     "parts": ["stairwell block", "fire door", "vent stack", "outdoor unit", "safety railing"]},
    {"slug": "webtoon_alley_food_cart", "id": "ts-bg3d-webtoon_alley_food_cart-mcp-v1",
     "name": "웹툰 골목 포장마차 카트", "theme": "urban",
     "description": "스테인리스 조리대·붉은 차양·진열대·버너·수납과 간이 의자를 갖춘 이동식 골목 포장마차",
     "tags": ["webtoon", "street food", "food cart", "alley", "urban", "웹툰", "포장마차", "노점", "골목"],
     "build": scene_food_cart,
     "parts": ["cart body", "cooking counter", "red canopy", "stools", "crates", "hanging lamp"]},
    {"slug": "webtoon_one_room_furniture_cluster", "id": "ts-bg3d-webtoon_one_room_furniture_cluster-mcp-v1",
     "name": "웹툰 원룸 가구 클러스터", "theme": "home",
     "description": "싱글 침대·책상·의자·옷장·책장·조명과 작은 생활 소품을 한 번에 배치하는 원룸 세트",
     "tags": ["webtoon", "one room", "furniture", "bed", "desk", "home", "웹툰", "원룸", "가구", "침실"],
     "build": scene_one_room,
     "parts": ["bed", "desk and chair", "wardrobe", "bookshelf with books", "floor lamp", "mini fridge"]},
    {"slug": "webtoon_apartment_lobby_module", "id": "ts-bg3d-webtoon_apartment_lobby_module-mcp-v1",
     "name": "웹툰 아파트 공동현관", "theme": "home",
     "description": "유리 출입문·석재 포털·택배함·인터폰·벤치·공지판으로 구성된 현대 아파트 공동현관 모듈",
     "tags": ["webtoon", "apartment", "lobby", "entrance", "parcel locker", "웹툰", "아파트", "공동현관", "택배함"],
     "build": scene_apartment_lobby,
     "parts": ["elevator doors", "glass entrance", "parcel locker bank", "bench", "notice board"]},
    {"slug": "webtoon_hanok_courtyard_gate", "id": "ts-bg3d-webtoon_hanok_courtyard_gate-mcp-v1",
     "name": "웹툰 한옥 안마당 대문", "theme": "heritage",
     "description": "목재 기둥·기와지붕·격자문·석재 문턱·담장 날개와 옹기를 갖춘 한옥 대문 배경 모듈",
     "tags": ["webtoon", "hanok", "gate", "heritage", "korea", "웹툰", "한옥", "대문", "기와"],
     "build": scene_hanok_gate,
     "parts": ["wood pillars", "tile gable roof", "lattice doors", "courtyard walls", "onggi jars"]},
    {"slug": "webtoon_convenience_store_fixture_cluster", "id": "ts-bg3d-webtoon_convenience_store_fixture_cluster-mcp-v1",
     "name": "웹툰 편의점 집기 클러스터", "theme": "retail",
     "description": "상품 진열대·음료 냉장고·계산대·전자레인지 선반·분리수거함과 장바구니를 묶은 편의점 집기 세트",
     "tags": ["webtoon", "convenience store", "retail", "shelves", "refrigerator", "웹툰", "편의점", "진열대", "계산대"],
     "build": scene_convenience_fixtures,
     "parts": ["product shelves", "drinks fridge", "checkout counter", "microwave unit", "recycle bin"]},
    {"slug": "webtoon_neighborhood_police_box", "id": "ts-bg3d-webtoon_neighborhood_police_box-mcp-v1",
     "name": "웹툰 동네 지구대 외관", "theme": "urban",
     "description": "유리 출입구·차양·경사로·보안 설비·자전거 거치대와 화단을 갖춘 소형 지구대 외관 모듈",
     "tags": ["webtoon", "police box", "public building", "urban", "korea", "웹툰", "지구대", "파출소", "공공건물"],
     "build": scene_police_box,
     "parts": ["station body", "glass entrance", "sign band", "bike rack", "planter"]},
    {"slug": "webtoon_riverside_park_pavilion", "id": "ts-bg3d-webtoon_riverside_park_pavilion-mcp-v1",
     "name": "웹툰 한강 공원 쉼터", "theme": "urban",
     "description": "곡면 금속 지붕·목재 천장·벤치·피크닉 테이블·음수대와 자전거 거치대를 갖춘 강변 공원 쉼터",
     "tags": ["webtoon", "riverside", "park", "pavilion", "bench", "웹툰", "한강", "공원", "쉼터"],
     "build": scene_park_pavilion,
     "parts": ["deck", "pavilion posts", "gable roof", "picnic table", "drinking fountain", "bike rack"]},
]

# ---------------------------------------------------------------- geometry

def _rot_y(verts, degrees):
    if not degrees:
        return verts
    a = math.radians(degrees)
    c, s = math.cos(a), math.sin(a)
    x, y, z = verts[:, 0].copy(), verts[:, 1], verts[:, 2].copy()
    verts[:, 0] = x * c + z * s
    verts[:, 2] = -x * s + z * c
    return verts


def _faces_to_tris(faces):
    tris = []
    for f in faces:
        for i in range(1, len(f) - 1):
            tris.append((f[0], f[i], f[i + 1]))
    return tris


def part_triangles(part):
    """Return (positions float32 [n,3], normals [n,3]) non-indexed triangles."""
    shape = part["shape"]
    cx, cy, cz = part["c"]
    if shape == "box":
        sx, sy, sz = part["s"]
        x0, x1, y0, y1, z0, z1 = -sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                 (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
        verts = np.array(v, dtype=np.float64)
        tris_idx = _faces_to_tris(faces)
    elif shape == "cyl":
        r, h = part["s"]
        seg = part.get("seg", 14)
        ring_b, ring_t = [], []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ring_b.append((r * math.cos(a), -h / 2, r * math.sin(a)))
            ring_t.append((r * math.cos(a), h / 2, r * math.sin(a)))
        verts = np.array(ring_b + ring_t, dtype=np.float64)
        faces = []
        for i in range(seg):
            j = (i + 1) % seg
            faces.append((i, j, seg + j, seg + i))
        faces.append(tuple(range(seg)))                      # bottom (-Y)
        faces.append(tuple(range(2 * seg - 1, seg - 1, -1)))  # top (+Y)
        tris_idx = _faces_to_tris(faces)
        if part.get("rot"):
            a = math.radians(part["rot"])
            rot = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)],
                            [0, math.sin(a), math.cos(a)]])
            verts = verts @ rot.T
    elif shape == "gable":
        sx, sy, sz = part["s"]
        x0, x1, y0, y1, z0, z1 = -sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2
        # 0..3 base corners, 4..5 ridge ends
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1),
             (x0, y1, 0.0), (x1, y1, 0.0)]
        faces = [(0, 1, 5, 4), (2, 5, 4, 3), (0, 1, 2, 3),
                 (0, 3, 4), (1, 5, 2)]
        verts = np.array(v, dtype=np.float64)
        tris_idx = _faces_to_tris(faces)
    else:
        raise ValueError(shape)
    pos = []
    for tri in tris_idx:
        pts = verts[list(tri)]
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        ln = np.linalg.norm(n)
        n = n / ln if ln > 0 else np.array([0.0, 1.0, 0.0])
        for pnt in pts:
            pos.append((pnt, n))
    positions = np.array([p[0] for p in pos], dtype=np.float64)
    normals = np.array([p[1] for p in pos], dtype=np.float64)
    positions = _rot_y(positions, part.get("rot_y", 0.0) if shape == "box" else 0.0)
    if shape == "box" and part.get("rot"):
        pass  # box rotation handled via rot_y key only; scenes use axis-aligned boxes
    positions += np.array([cx, cy, cz])
    # rotate normals the same way (identity for current scenes)
    return positions.astype(np.float32), normals.astype(np.float32)


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5))


def build_glb(asset, parts):
    materials, mat_index = [], {}
    meshes, nodes = [], []
    bin_chunks, accessors, buffer_views = [], [], []
    offset = 0

    def add_view(data: bytes, target):
        nonlocal offset
        pad = (4 - len(data) % 4) % 4
        buffer_views.append({"buffer": 0, "byteOffset": offset,
                             "byteLength": len(data), "target": target})
        bin_chunks.append(data + b"\x00" * pad)
        offset += len(data) + pad
        return len(buffer_views) - 1

    for part in parts:
        pos, nor = part_triangles(part)
        idx = np.arange(len(pos), dtype=np.uint32)
        pv = add_view(pos.tobytes(), 34962)
        accessors.append({"bufferView": pv, "componentType": 5126, "count": len(pos),
                          "type": "VEC3",
                          "min": pos.min(axis=0).tolist(), "max": pos.max(axis=0).tolist()})
        nv = add_view(nor.tobytes(), 34962)
        accessors.append({"bufferView": nv, "componentType": 5126, "count": len(nor),
                          "type": "VEC3"})
        iv = add_view(idx.tobytes(), 34963)
        accessors.append({"bufferView": iv, "componentType": 5125, "count": len(idx),
                          "type": "SCALAR"})
        color = part["color"]
        if color not in mat_index:
            mat_index[color] = len(materials)
            r, g, b = hex_rgb(color)
            materials.append({"name": f"authored-{color[1:]}",
                              "pbrMetallicRoughness": {
                                  "baseColorFactor": [r, g, b, 1.0],
                                  "metallicFactor": 0.0, "roughnessFactor": 0.9},
                              "doubleSided": True})
        base = len(accessors) - 3
        meshes.append({"name": part["name"],
                       "primitives": [{"attributes": {"POSITION": base, "NORMAL": base + 1},
                                       "indices": base + 2,
                                       "material": mat_index[color]}]})
        nodes.append({"name": part["name"], "mesh": len(meshes) - 1})
    root = {"name": f"TS_ENV_{asset['slug']}_Root",
            "children": list(range(len(nodes))),
            "extras": {"asset_id": asset["id"], "asset_type": "studio-bg3d-environment",
                       "asset_author": "ToonStudio", "asset_license": "CC0-1.0",
                       "asset_license_url": CC0_URL,
                       "asset_generator": GENERATOR,
                       "units": "metres", "ground_plane": "glTF-Y=0"}}
    nodes.append(root)
    gltf = {"asset": {"version": "2.0", "generator": f"toonstudio {GENERATOR} {GENERATOR_VERSION}"},
            "scene": 0, "scenes": [{"nodes": [len(nodes) - 1]}],
            "nodes": nodes, "meshes": meshes, "materials": materials,
            "accessors": accessors, "bufferViews": buffer_views,
            "buffers": [{"byteLength": offset}]}
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode()
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = b"".join(bin_chunks)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    out = [struct.pack("<III", 0x46546C67, 2, total),
           struct.pack("<II", len(json_bytes), 0x4E4F534A), json_bytes,
           struct.pack("<II", len(bin_bytes), 0x004E4942), bin_bytes]
    return b"".join(out), len(nodes), len(meshes), sum(len(part_triangles(p)[0]) // 3 for p in parts), len(materials)


# ---------------------------------------------------------------- thumbnail

def render_thumbnail(parts, path, width=960, height=720):
    tris = []
    for part in parts:
        pos, nor = part_triangles(part)
        rgb = np.array(hex_rgb(part["color"]))
        for i in range(0, len(pos), 3):
            tris.append((pos[i:i + 3].astype(np.float64), nor[i].astype(np.float64), rgb))
    all_pos = np.concatenate([t[0] for t in tris])
    centre = (all_pos.min(axis=0) + all_pos.max(axis=0)) / 2
    view = np.array([1.0, 0.72, 1.0]); view /= np.linalg.norm(view)
    right = np.cross(np.array([0.0, 1.0, 0.0]), view); right /= np.linalg.norm(right)
    up = np.cross(view, right)
    light = np.array([-0.45, 0.85, 0.4]); light /= np.linalg.norm(light)
    proj = []
    for pts, n, rgb in tris:
        rel = pts - centre
        xy = np.stack([rel @ right, rel @ up], axis=1)
        dep = rel @ view
        shade = 0.52 + 0.48 * abs(float(n @ light))
        proj.append((xy, dep, rgb * shade))
    all_xy = np.concatenate([p[0] for p in proj])
    lo_xy, hi_xy = all_xy.min(axis=0), all_xy.max(axis=0)
    span = max(float((hi_xy - lo_xy).max()), 1e-6)
    scale = min(width, height) * 0.92 / span
    img = np.full((height, width, 3), (240, 242, 244), dtype=np.uint8)
    zbuf = np.full((height, width), -1e18)
    for xy, dep, rgb in proj:
        px = (xy - lo_xy) * scale
        px[:, 0] += (width - (hi_xy[0] - lo_xy[0]) * scale) / 2
        px[:, 1] = height - px[:, 1] - (height - (hi_xy[1] - lo_xy[1]) * scale) / 2
        x0, x1 = int(max(px[:, 0].min(), 0)), int(min(px[:, 0].max(), width - 1))
        y0, y1 = int(max(px[:, 1].min(), 0)), int(min(px[:, 1].max(), height - 1))
        if x1 <= x0 or y1 <= y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        (ax, ay), (bx, by), (cx2, cy2) = px
        den = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2)
        if abs(den) < 1e-9:
            continue
        l0 = ((by - cy2) * (gx - cx2) + (cx2 - bx) * (gy - cy2)) / den
        l1 = ((cy2 - ay) * (gx - cx2) + (ax - cx2) * (gy - cy2)) / den
        l2 = 1 - l0 - l1
        inside = (l0 >= 0) & (l1 >= 0) & (l2 >= 0)
        if not inside.any():
            continue
        pix_depth = l0 * dep[0] + l1 * dep[1] + l2 * dep[2]
        region = zbuf[y0:y1 + 1, x0:x1 + 1]
        upd = inside & (pix_depth > region)
        if not upd.any():
            continue
        region[upd] = pix_depth[upd]
        img[y0:y1 + 1, x0:x1 + 1][upd] = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    raw = b"".join(b"\x00" + img[row].tobytes() for row in range(height))

    def chunk(kind, data):
        c = struct.pack(">I", len(data)) + kind + data
        return c + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
           + chunk(b"IEND", b""))
    Path(path).write_bytes(png)


# ---------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default=f"apps/web/public/assets/3d/environments/{PACK_VERSION}")
    parser.add_argument("--only", action="append", choices=[a["slug"] for a in ASSETS])
    args = parser.parse_args()
    out = Path(args.output_dir)
    (out / "thumbnails").mkdir(parents=True, exist_ok=True)
    records = []
    for asset in ASSETS:
        if args.only and asset["slug"] not in args.only:
            continue
        parts = asset["build"]()
        glb, n_nodes, n_meshes, n_tris, n_mats = build_glb(asset, parts)
        file_name = f"{asset['slug']}.glb"
        (out / file_name).write_bytes(glb)
        thumb_rel = f"thumbnails/{asset['slug']}.png"
        render_thumbnail(parts, out / thumb_rel)
        all_pos = np.concatenate([part_triangles(p)[0] for p in parts])
        lo, hi = all_pos.min(axis=0), all_pos.max(axis=0)
        bounds = [round(float(hi[i] - lo[i]), 3) for i in (0, 1, 2)]
        max_dim = max(bounds)
        cam_pos = [round(max_dim * 0.78, 3), round(bounds[1] * 0.55 + max_dim * 0.42, 3),
                   round(max_dim * 0.88, 3)]
        records.append({
            "id": asset["id"],
            "generator": GENERATOR, "generatorVersion": GENERATOR_VERSION,
            "license": "CC0-1.0", "licenseUrl": CC0_URL,
            "originalProceduralGeometry": True, "externalRuntimeResources": 0,
            "semanticParts": asset["parts"],
            "studioRuntimeVerified": False, "allAnglesArtisticallyApproved": False,
            "visualReviewLevel": "single-perspective-software-render",
            "metrics": {"bytes": len(glb), "nodes": n_nodes, "meshes": n_meshes,
                        "triangles": n_tris, "materials": n_mats, "textures": 0},
            "byteSize": len(glb),
            "sha256": f"sha256:{hashlib.sha256(glb).hexdigest()}",
            "bounds": bounds,
            "camera": {"position": cam_pos,
                       "target": [0.0, round(bounds[1] * 0.42, 3), 0.0], "fovDegrees": 50},
            "url": f"/assets/3d/environments/{PACK_VERSION}/{file_name}",
            "fileName": file_name,
            "thumbnailUrl": f"/assets/3d/environments/{PACK_VERSION}/{thumb_rel}",
            "name": asset["name"], "theme": asset["theme"],
            "description": asset["description"], "tags": asset["tags"],
            "visualReviewed": True,
            "visualReviewSource": f"/assets/3d/environments/{PACK_VERSION}/{thumb_rel}",
            "rootMetadata": {"asset_id": asset["id"],
                             "asset_type": "studio-bg3d-environment",
                             "asset_author": "ToonStudio", "asset_license": "CC0-1.0",
                             "asset_license_url": CC0_URL, "asset_generator": GENERATOR,
                             "units": "metres", "ground_plane": "glTF-Y=0"},
        })
        print(f"{file_name}: {len(glb)} bytes, {n_tris} tris, bounds {bounds}")
    if not args.only:
        manifest = {"schema": "toonstudio.bg3d-environment-pack.authored-v1",
                    "version": PACK_VERSION, "assets": records}
        (out / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"manifest.json: {len(records)} assets")


if __name__ == "__main__":
    sys.exit(main())
