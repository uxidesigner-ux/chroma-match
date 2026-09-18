"""Reshape the candidate copy of the original meshes. Does not touch the original."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path("/workspace/tools/figure")
sys.path.insert(0, str(ROOT))
import character  # noqa: E402
import lib  # noqa: E402

CANDIDATE = ROOT / "assets/long-wave/candidate"
BLEND = CANDIDATE / "hair_long_wave.blend"

HAIRLINE = [
    (-0.90, 0.04), (-0.70, 0.13), (-0.56, 0.20), (-0.42, 0.30),
    (-0.28, 0.42), (-0.14, 0.56), (0.00, 0.73), (0.14, 0.90),
    (0.22, 0.92), (0.38, 0.90), (0.58, 0.72), (0.78, 0.32), (0.90, 0.06),
]


def auth(co):
    return Vector((co.x, co.z, -co.y))


def to_b(p):
    return Vector(character.to_blender((p.x, p.y, p.z)))


def hairline_y(x):
    if x <= HAIRLINE[0][0]:
        return HAIRLINE[0][1]
    if x >= HAIRLINE[-1][0]:
        return HAIRLINE[-1][1]
    for i in range(len(HAIRLINE) - 1):
        x0, y0 = HAIRLINE[i]
        x1, y1 = HAIRLINE[i + 1]
        if x0 <= x <= x1:
            t = (x - x0) / ((x1 - x0) or 1.0)
            t = t * t * (3.0 - 2.0 * t)
            return y0 + (y1 - y0) * t
    return HAIRLINE[-1][1]


def deform_bang(obj):
    """Retract the hanging visor; thicken the forehead mass."""
    temple = Vector((-0.74, 0.08, 0.38))
    for v in obj.data.vertices:
        p = auth(v.co)
        if p.y < 0.10:
            t = min(1.0, (0.10 - p.y) / 1.8)
            p = p.lerp(temple, 0.62 * t)
            # keep a little forward volume at the temple, not a spike
            p.z = max(p.z, 0.22)
        if 0.12 < p.y < 1.00 and p.z > 0.15:
            cx = -0.18
            p.x = cx + (p.x - cx) * 1.28
            p.z += 0.07 * min(1.0, (p.y - 0.12) / 0.50)
            # round the upper mass toward the part
            if p.y > 0.70:
                p.y += 0.04
        v.co = to_b(p)
    obj.data.update()
    lib.relax(obj, 0.20, 2)
    lib.shaded_smooth(obj)


def deform_side(obj, sign, phase):
    for v in obj.data.vertices:
        p = auth(v.co)
        t = (1.00 - p.y) / 4.10
        t = max(0.0, min(1.0, t))
        # large S, not ripples
        p.x += sign * 0.06 * math.sin(t * math.pi * 1.15 + phase)
        p.z += 0.11 * math.sin(t * math.pi * 1.05 + phase)
        # extra silhouette volume (do not inflate the skull)
        if p.y < 0.70:
            p.x += sign * 0.10 * t
        if t > 0.75:
            p.x -= sign * 0.12 * ((t - 0.75) / 0.25)
            p.z += 0.07 * ((t - 0.75) / 0.25)
        v.co = to_b(p)
    obj.data.update()
    lib.relax(obj, 0.16, 1)
    lib.shaded_smooth(obj)


def deform_scalp(obj):
    """Lift the front rim to the measured hairline so it is not a straight cut."""
    for v in obj.data.vertices:
        p = auth(v.co)
        if p.z < 0.05:
            continue
        hl = hairline_y(p.x)
        if p.y < hl and p.y > -0.4 and abs(p.x) < 0.95:
            w = min(1.0, (hl - p.y) / 0.55)
            p.y = p.y + (hl - p.y) * 0.85 * w
            p.z = max(p.z, 0.20)
        # part groove
        if p.y > 0.70:
            g = math.exp(-((p.x - 0.24) ** 2) / 0.028)
            p.y -= 0.04 * g
            p.z -= 0.02 * g
        v.co = to_b(p)
    obj.data.update()
    lib.relax(obj, 0.18, 2)
    lib.shaded_smooth(obj)


def deform_back(obj, phase):
    for v in obj.data.vertices:
        p = auth(v.co)
        t = (1.05 - p.y) / 4.15
        t = max(0.0, min(1.0, t))
        p.z -= 0.04 * math.sin(t * math.pi * 1.1 + phase)
        p.x += 0.05 * math.sin(t * math.pi * 1.0 + phase)
        v.co = to_b(p)
    obj.data.update()
    lib.relax(obj, 0.14, 1)
    lib.shaded_smooth(obj)


def main():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    deform_bang(bpy.data.objects["hair_bang"])
    deform_scalp(bpy.data.objects["hair_scalp"])
    deform_side(bpy.data.objects["hair_side_l_upper"], -1, 0.15)
    deform_side(bpy.data.objects["hair_side_l_under"], -1, 1.10)
    deform_side(bpy.data.objects["hair_side_r_upper"], 1, 0.40)
    deform_side(bpy.data.objects["hair_side_r_under"], 1, 1.35)
    deform_back(bpy.data.objects["hair_back_top"], 0.2)
    deform_back(bpy.data.objects["hair_back_nape_l"], 0.9)
    deform_back(bpy.data.objects["hair_back_nape_r"], 1.4)
    for name in bpy.data.objects.keys():
        if name.startswith("hair"):
            print("deformed", name)
    CANDIDATE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("SAVED", BLEND)


if __name__ == "__main__":
    main()
