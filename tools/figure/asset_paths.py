"""Paths for the long-wave hair asset.

Generation must never overwrite the editable original or the shipped GLB.

    BLEND, HAIR_GLB  — written by a person / export_hair.py
    GENERATED        — hair_long_wave.py, sculpt_long_wave.py
    BODY_GLB         — character.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]

ASSET = ROOT / "assets" / "long-wave"
GENERATED = ASSET / "generated"
BLEND = ASSET / "hair_long_wave.blend"

PUBLIC = REPO / "public" / "figure"
BODY_GLB = PUBLIC / "body.glb"
HAIR_GLB = PUBLIC / "hair_long_wave.glb"
CHARACTER_GLB = PUBLIC / "character.glb"
