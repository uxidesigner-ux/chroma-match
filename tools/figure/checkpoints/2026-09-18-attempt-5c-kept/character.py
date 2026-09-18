"""
Build the representative character and write it out as a GLB.

Proportions are in head units — the skull is 2.0 tall from crown to chin and
centred on the origin — so every part has one shared frame and a hairstyle
cannot move the face.

Written in a right-handed frame with y up and z towards the viewer, which is
what the browser uses, and converted to Blender's z-up on the way into the mesh.
The glTF exporter converts back.
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import lib  # noqa: E402

# Face / body unlocked for the representative sculpt. Previous passes held these
# fixed so hair could be compared in isolation; that constraint is lifted here
# because the hair-to-face ratio and the neck/collar join are part of the same
# judgment as the hair itself.
HEAD_HALF_W = 0.745
HEAD_HALF_D = 0.790
SQUARENESS = 2.25
EYE_Y, EYE_X = 0.020, 0.238
# Flatter eyes — almost discs. Bead highlights come from protrusion + gloss.
EYE_W, EYE_H, EYE_D = 0.068, 0.070, 0.022
NOSE_Y, NOSE_OUT = -0.185, 0.168
NECKLINE_Y = -1.12
SHOULDER_HALF = 1.08
NECK_TOP_Y = -0.88


def to_blender(p):
    """(x, up, front) -> Blender (x, -front, up)."""
    return (p[0], -p[2], p[1])


def axes_at(y):
    jaw = lib.smoothstep(-0.30, -1.0, y)
    crown = lib.smoothstep(0.55, 1.0, y)
    return (
        HEAD_HALF_W * (1 - 0.145 * jaw - 0.060 * crown),
        HEAD_HALF_D * (1 - 0.110 * jaw - 0.040 * crown),
    )


def super_radius(d, a, b, c, k):
    s = max(1e-9, (abs(d[0]) / a) ** k + (abs(d[1]) / b) ** k + (abs(d[2]) / c) ** k)
    return s ** (-1 / k)


def head_surface(d):
    a, c = axes_at(d[1])
    r = super_radius(d, a, 1.0, c, SQUARENESS)
    p = [d[0] * r, d[1] * r, d[2] * r]
    front = lib.smoothstep(-0.05, 0.60, d[2])

    # Softer, broader modelling. The reference face is simple: rounded cheeks,
    # a short clear nose, no stretched lump from brow to chin.
    brow = lib.blob(math.hypot(p[0] / 0.70, (p[1] - 0.175) / 0.210))
    p[2] += brow * 0.018 * front

    cheek = lib.blob(math.hypot((abs(p[0]) - 0.280) / 0.460, (p[1] + 0.200) / 0.360))
    p[2] += cheek * 0.038 * front

    # Jaw rounds into the cheek rather than pinching to a point.
    jaw = lib.blob(math.hypot((abs(p[0]) - 0.220) / 0.380, (p[1] + 0.520) / 0.280))
    p[2] += jaw * 0.016 * front

    chin = lib.blob(math.hypot(p[0] / 0.360, (p[1] + 0.780) / 0.300))
    p[2] += chin * 0.040 * front

    # Nose: short wedge with a readable lit plane and a soft tip — not a tall
    # smudge and not a sharp beak.
    dy = p[1] - NOSE_Y
    vy = dy / 0.175 if dy > 0 else dy / 0.100
    nose = lib.blob(math.hypot(p[0] / 0.135, vy))
    p[2] += nose * NOSE_OUT * front
    p[1] -= nose * 0.012
    # A slight bridge ridge so the form holds under soft light.
    bridge = lib.blob(math.hypot(p[0] / 0.090, (p[1] - (NOSE_Y + 0.12)) / 0.140))
    p[2] += bridge * 0.028 * front

    # Very shallow sockets — eyes should not sit on stilts.
    socket = lib.blob(math.hypot((abs(p[0]) - EYE_X) / 0.195, (p[1] - EYE_Y) / 0.155))
    p[2] -= socket * 0.018 * front

    return p


def body_axes(y):
    # Continuous slope from under the jaw into the shoulder. No thin post.
    neck = 0.420
    to_shoulder = lib.smoothstep(NECK_TOP_Y, -1.65, y)
    to_chest = lib.smoothstep(-1.60, -2.50, y)
    return (
        lib.mix(neck, SHOULDER_HALF, to_shoulder ** 0.85) + 0.06 * to_chest,
        lib.mix(0.360, 0.480, to_shoulder ** 0.90) + 0.045 * to_chest,
    )


def build_head():
    obj = lib.sphere_cage(40, 26, lambda d: to_blender(head_surface((d.x, d.z, -d.y))))
    lib.subsurf(obj, 2)
    lib.relax(obj, 0.35, 1)
    lib.shaded_smooth(obj)
    obj.name = "head"
    return obj


def build_body():
    def shape(d):
        t = (d.z + 1) / 2
        # Top of the body meets the chin more closely so neck length is short
        # and the shoulder slope starts under the jaw, not a handspan below it.
        y = lib.mix(-3.05, NECK_TOP_Y + 0.18, t)
        a, c = body_axes(y)
        cap = math.sqrt(max(0.0, 1 - abs(d.z) ** 12))
        horiz = math.hypot(d.x, d.y) or 1e-5
        ux, uy = d.x / horiz, d.y / horiz
        k = 2.6
        s = max(1e-9, (abs(ux) / a) ** k + (abs(uy) / c) ** k)
        r = s ** (-1 / k)
        return (ux * r * cap, uy * r * cap, y)

    obj = lib.sphere_cage(36, 30, shape)
    lib.subsurf(obj, 2)
    lib.shaded_smooth(obj)
    obj.name = "body"
    return obj


def build_top():
    """Crew neck that follows the shoulder slope — no triangle of chest skin."""
    hem = -3.15
    cloth = 0.080

    def shape(d):
        t = (d.z + 1) / 2
        v = 1 - t
        y = lib.mix(NECKLINE_Y, hem, v ** 0.94)
        a, c = body_axes(y)
        roll = lib.smoothstep(0.10, 0.0, v)
        grow = cloth * (1 - 0.40 * roll)
        # Opening tracks the neck section closely so skin does not fan out
        # above the collar as a triangle.
        a_open = a + grow * 0.95
        c_open = c + grow * 0.85
        if v < 0.06:
            # Round crew: pull the front of the opening up slightly so the
            # visible skin above the cloth is a short band, not a V.
            c_open *= 0.92
        horiz = math.hypot(d.x, d.y) or 1e-5
        ux, uy = d.x / horiz, d.y / horiz
        k = 2.5
        s = max(1e-9, (abs(ux) / a_open) ** k + (abs(uy) / c_open) ** k)
        r = s ** (-1 / k)
        return (ux * r, uy * r, y)

    obj = lib.sphere_cage(48, 32, shape)
    lib.subsurf(obj, 2)
    lib.shaded_smooth(obj)
    obj.name = "top"
    return obj


def build():
    lib.reset()
    skin = lib.material("skin", (0.941, 0.722, 0.580), 0.78)
    hair_mat = lib.material("hair", (0.290, 0.220, 0.185), 0.58)
    cloth = lib.material("cloth", (0.135, 0.135, 0.165), 0.95)
    # Soft eye: less specular bead. The reference eyes are simple dark ovals,
    # not glass marbles.
    eye_mat = lib.material("eye", (0.145, 0.118, 0.110), 0.55)

    lib.assign(build_head(), skin)
    lib.assign(build_body(), skin)
    lib.assign(build_top(), cloth)

    from hair import build_hair
    lib.assign(build_hair(), hair_mat)

    for side, tag in ((-1, "l"), (1, "r")):
        a, c = axes_at(EYE_Y)
        rest = (abs(EYE_X) / a) ** SQUARENESS + (abs(EYE_Y) / 1.0) ** SQUARENESS
        z = 0.0 if rest >= 1 else c * (1 - rest) ** (1 / SQUARENESS)
        eye = lib.sphere_cage(
            20, 14,
            lambda d: to_blender((d.x * EYE_W, d.z * EYE_H, -d.y * EYE_D)),
        )
        lib.subsurf(eye, 2)
        lib.shaded_smooth(eye)
        eye.name = "eye_" + tag
        # Seated deeper in the socket; less protrusion = less bead highlight.
        eye.location = to_blender((side * EYE_X, EYE_Y, z - 0.018))
        lib.assign(eye, eye_mat)

        ear = lib.sphere_cage(16, 12, lambda d: to_blender((d.x * 0.045, d.z * 0.140, -d.y * 0.095)))
        lib.subsurf(ear, 1)
        lib.shaded_smooth(ear)
        ear.name = "ear_" + tag
        ear.location = to_blender((side * (axes_at(0.0)[0] - 0.035), 0.005, -0.130))
        lib.assign(ear, skin)

    out = Path(__file__).resolve().parents[2] / "public" / "figure" / "character.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    lib.export(str(out))
    total = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
    print(f"BUILT {out} verts={total} bytes={out.stat().st_size}")


if __name__ == "__main__":
    build()
