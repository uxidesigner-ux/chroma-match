"""Headless form attempts. Writes generated/sculpt_attempt.blend only.

Does not overwrite the editable original or the shipped hair GLB.
Tubes in generated/blockout.blend are the frozen starting blockout.
A desktop sculptor edits hair_long_wave.blend; export_hair.py writes the GLB.

Silhouette is taken from the original (top panel of sheet-long-wave.jpg)
scaled by the confirmed eye spacing (sep 148.8 px → 0.524 head units).
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import asset_paths  # noqa: E402
import character  # noqa: E402
import lib  # noqa: E402

# Front-view outer silhouette of the original, eye-scaled. y up, x right.
LEFT_SIL = [
    (1.51, -0.70),
    (1.09, -1.14),
    (0.45, -1.45),
    (0.03, -1.65),
    (-0.39, -1.70),
    (-0.81, -1.64),
    (-1.24, -1.75),
    (-1.66, -2.10),
    (-2.08, -2.21),
    (-2.50, -2.17),
    (-3.02, -2.26),
]
RIGHT_SIL = [
    (1.51, 0.53),
    (1.09, 1.13),
    (0.45, 1.35),
    (0.03, 1.45),
    (-0.39, 1.54),
    (-0.81, 1.45),
    (-1.13, 1.31),
    (-1.66, 1.75),
    (-2.08, 1.98),
    (-2.50, 1.92),
    (-3.02, 1.92),
]

# Visible bang / hairline in the front view (x, y). Part is near x=0.26, y=0.92.
BANG_EDGE = [
    (0.26, 0.92),
    (0.16, 0.89),
    (0.05, 0.78),
    (-0.05, 0.64),
    (-0.16, 0.52),
    (-0.32, 0.37),
    (-0.48, 0.23),
    (-0.63, 0.08),
]


def _v(p):
    return Vector(p)


def _keys(keys, u):
    u = 0.0 if u < 0.0 else 1.0 if u > 1.0 else u
    for i in range(len(keys) - 1):
        u0, p0 = keys[i]
        u1, p1 = keys[i + 1]
        if u <= u1 or i == len(keys) - 2:
            span = u1 - u0 or 1.0
            t = (u - u0) / span
            t = 0.0 if t < 0.0 else 1.0 if t > 1.0 else t
            t = t * t * (3.0 - 2.0 * t)
            a, b = _v(p0), _v(p1)
            return a.lerp(b, t)
    return _v(keys[-1][1])


def _bezier(a, b, c, t):
    s = 1.0 - t
    return a * (s * s) + b * (2.0 * s * t) + c * (t * t)


def _auth_to_blender(p):
    return Vector(character.to_blender((p.x, p.y, p.z)))


def _auth_of(co):
    return (co.x, co.z, -co.y)


def _lerp_sil(table, y):
    if y >= table[0][0]:
        return table[0][1]
    if y <= table[-1][0]:
        return table[-1][1]
    for i in range(len(table) - 1):
        y0, x0 = table[i]
        y1, x1 = table[i + 1]
        if y <= y0 and y >= y1:
            t = (y0 - y) / (y0 - y1)
            t = t * t * (3.0 - 2.0 * t)
            return x0 + (x1 - x0) * t
    return table[-1][1]


def sit(head, x, y, clearance, prefer_z=0.70):
    """Keep authored (x, y); take z from the nearest finished-head vertex."""
    best = None
    for vertex in head.data.vertices:
        q = _auth_of(head.matrix_world @ vertex.co)
        d = (q[0] - x) ** 2 + (q[1] - y) ** 2 + 0.28 * (q[2] - prefer_z) ** 2
        if best is None or d < best[0]:
            best = (d, q)
    z = best[1][2] + clearance
    return (x, y, z)


def clump(name, path, widths, flatten, tilt, resolution=18):
    obj = lib.ribbon(
        name,
        [character.to_blender(p) for p in path],
        widths,
        flatten=flatten,
        tilt=tilt,
        resolution=resolution,
    )
    obj.name = name
    obj.data.name = name
    lib.relax(obj, 0.14, 1)
    lib.shaded_smooth(obj)
    return obj


# --- scalp: smooth hairline cap, not a deleted-sphere stair ---

# u = 0 left temple → 1 right temple. These are already the OUTER surface.
HAIRLINE = [
    (0.00, (-0.88, 0.20, 0.18)),
    (0.14, (-0.70, 0.42, 0.62)),
    (0.28, (-0.42, 0.58, 0.90)),
    (0.42, (-0.10, 0.70, 0.78)),
    (0.54, (0.18, 0.78, 0.42)),
    (0.68, (0.46, 0.70, 0.36)),
    (0.84, (0.74, 0.40, 0.24)),
    (1.00, (0.90, 0.18, 0.16)),
]
CROWN = [
    (0.00, (-0.72, 1.28, -0.02)),
    (0.22, (-0.36, 1.42, 0.04)),
    (0.50, (0.16, 1.38, -0.10)),
    (0.78, (0.54, 1.36, 0.00)),
    (1.00, (0.76, 1.26, -0.02)),
]
NAPE = [
    (0.00, (-0.76, 0.04, -0.38)),
    (0.25, (-0.40, -0.10, -0.78)),
    (0.50, (0.04, -0.16, -0.90)),
    (0.75, (0.46, -0.10, -0.76)),
    (1.00, (0.80, 0.04, -0.36)),
]


def cap_outer(u, v):
    h = _keys(HAIRLINE, u)
    c = _keys(CROWN, u)
    n = _keys(NAPE, u)
    if v < 0.48:
        t = v / 0.48
        return _bezier(h, h.lerp(c, 0.55), c, t)
    t = (v - 0.48) / 0.52
    return _bezier(c, c.lerp(n, 0.50), n, t)


def cap_inner(u, v):
    p = cap_outer(u, v)
    s = Vector(character.head_surface((p.x, p.y, p.z)))
    delta = p - s
    if delta.length < 1e-4:
        n = p.normalized()
        return p - n * 0.11
    n = delta.normalized()
    # Keep a gap off the skull; do not slam onto the surface.
    return s + n * 0.06


def grid_shell(name, sample_outer, sample_inner, nu, nv):
    verts = []
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            u = i / (nu - 1)
            verts.append(_auth_to_blender(sample_outer(u, v)))
    inner_off = len(verts)
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            u = i / (nu - 1)
            verts.append(_auth_to_blender(sample_inner(u, v)))

    faces = []

    def quad(a, b, c, d):
        faces.append((a, b, c, d))

    for j in range(nv - 1):
        for i in range(nu - 1):
            a = j * nu + i
            quad(a, a + nu, a + nu + 1, a + 1)
            b = inner_off + a
            quad(b + 1, b + nu + 1, b + nu, b)
    for i in range(nu - 1):
        a, b = i, i + 1
        quad(a, b, inner_off + b, inner_off + a)
        a = (nv - 1) * nu + i
        b = a + 1
        quad(b, a, inner_off + a, inner_off + b)
    for j in range(nv - 1):
        a = j * nu
        c = a + nu
        quad(a, inner_off + a, inner_off + c, c)
        a = j * nu + (nu - 1)
        c = a + nu
        quad(a, c, inner_off + c, inner_off + a)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    lib.subsurf(obj, 1)
    lib.shaded_smooth(obj)
    obj.name = name
    obj.data.name = name
    return obj


def part_groove(obj, strength=0.055):
    part_x = 0.22
    for vertex in obj.data.vertices:
        q = Vector(_auth_of(vertex.co))
        if q.z < -0.15 or q.y < 0.55:
            continue
        w = math.exp(-((q.x - part_x) ** 2) / 0.022)
        if w < 0.04:
            continue
        r = q.length or 1.0
        inward = q * ((r - strength * w) / r)
        vertex.co = Vector(character.to_blender((inward.x, inward.y, inward.z)))
    obj.data.update()


def build_scalp():
    obj = grid_shell("hair_scalp", cap_outer, cap_inner, 26, 14)
    part_groove(obj)
    return obj


def build_bang(head):
    """Wide diagonal bang that continues into the left front flow.

    Centreline is the original's visible bang edge, seated in front of the
    finished forehead, then the left silhouette down to the hem.
    """
    path = []
    for x, y in BANG_EDGE:
        prefer = 0.12 if y > 0.82 else 0.82
        clearance = 0.11 if y > 0.82 else 0.16
        path.append(sit(head, x, y, clearance, prefer_z=prefer))
    # From the left temple the bang becomes the front-left wave.
    for y, z, inset in [
        (-0.25, 0.28, 0.38),
        (-0.70, 0.16, 0.40),
        (-1.15, 0.10, 0.42),
        (-1.60, 0.18, 0.40),
        (-2.05, 0.12, 0.38),
        (-2.55, 0.06, 0.36),
        (-3.00, 0.02, 0.34),
    ]:
        x = _lerp_sil(LEFT_SIL, y) + inset
        path.append((x, y, z))
    widths = [
        0.22, 0.42, 0.58, 0.70, 0.76, 0.72, 0.62, 0.50,
        0.48, 0.62, 0.78, 0.86, 0.80, 0.58, 0.28,
    ]
    tilt = [
        0.10, -0.48, -0.78, -0.88, -0.86, -0.72, -0.46, -0.18,
        0.04, 0.08, 0.10, 0.12, 0.10, 0.06, 0.02,
    ]
    return clump("hair_bang", path, widths, flatten=0.30, tilt=tilt, resolution=20)


def build_left():
    """Large S on the viewer's left — flattened clumps, not hanging tubes."""
    def spine(phase, z0, inset):
        ys = [0.92, 0.55, 0.15, -0.35, -0.85, -1.35, -1.80, -2.25, -2.70, -3.02]
        pts = []
        for i, y in enumerate(ys):
            wave = 0.06 * math.sin(i * 0.85 + phase)
            x = _lerp_sil(LEFT_SIL, y) + inset + wave
            z = z0 + 0.10 * math.sin(i * 0.7 + phase) - 0.04 * i
            pts.append((x, y, z))
        return pts

    widths = [0.42, 0.62, 0.80, 0.92, 0.96, 0.90, 0.82, 0.70, 0.42, 0.16]
    tilt = [0.08, 0.06, 0.04, 0.08, 0.12, 0.10, 0.08, 0.06, 0.04, 0.02]
    front = clump(
        "hair_side_l_front",
        spine(0.0, 0.22, 0.36),
        widths,
        flatten=0.32,
        tilt=tilt,
    )
    mid = clump(
        "hair_side_l_mid",
        spine(0.9, 0.02, 0.28),
        [w * 0.92 for w in widths],
        flatten=0.34,
        tilt=tilt,
    )
    back = clump(
        "hair_side_l_back",
        spine(1.7, -0.28, 0.30),
        [w * 0.88 for w in widths],
        flatten=0.36,
        tilt=0.05,
    )
    return [front, mid, back]


def build_right():
    def spine(phase, z0, inset):
        ys = [0.96, 0.58, 0.18, -0.28, -0.78, -1.18, -1.62, -2.08, -2.55, -3.02]
        pts = []
        for i, y in enumerate(ys):
            wave = 0.07 * math.sin(i * 0.80 + phase)
            x = _lerp_sil(RIGHT_SIL, y) - inset + wave
            z = z0 + 0.11 * math.sin(i * 0.65 + phase) - 0.03 * i
            pts.append((x, y, z))
        return pts

    widths = [0.38, 0.58, 0.74, 0.86, 0.90, 0.84, 0.78, 0.68, 0.40, 0.16]
    tilt = [0.08, 0.06, 0.04, 0.08, 0.14, 0.12, 0.08, 0.06, 0.04, 0.02]
    front = clump(
        "hair_side_r_front",
        spine(0.2, 0.20, 0.32),
        widths,
        flatten=0.32,
        tilt=tilt,
    )
    mid = clump(
        "hair_side_r_mid",
        spine(1.1, 0.00, 0.26),
        [w * 0.90 for w in widths],
        flatten=0.34,
        tilt=tilt,
    )
    back = clump(
        "hair_side_r_back",
        spine(1.9, -0.30, 0.28),
        [w * 0.86 for w in widths],
        flatten=0.36,
        tilt=0.05,
    )
    return [front, mid, back]


def build_back():
    top = clump(
        "hair_back",
        [
            (0.08, 1.22, -0.32),
            (0.04, 0.72, -0.88),
            (0.00, 0.18, -1.02),
            (0.02, -0.45, -0.82),
            (0.00, -1.10, -0.55),
            (0.02, -1.75, -0.38),
            (0.00, -2.40, -0.22),
            (0.02, -3.02, -0.12),
        ],
        [0.78, 1.08, 1.22, 1.18, 1.04, 0.86, 0.52, 0.20],
        flatten=0.42,
        tilt=0.04,
    )
    nape_l = clump(
        "hair_nape_l",
        [
            (-0.28, 0.62, -0.55),
            (-0.52, 0.05, -0.62),
            (-0.70, -0.70, -0.42),
            (-0.58, -1.40, -0.24),
            (-0.78, -2.10, -0.14),
            (-0.62, -2.80, -0.08),
            (-0.68, -3.02, -0.04),
        ],
        [0.46, 0.70, 0.78, 0.68, 0.48, 0.28, 0.12],
        flatten=0.40,
        tilt=0.04,
    )
    nape_r = clump(
        "hair_nape_r",
        [
            (0.32, 0.62, -0.55),
            (0.56, 0.05, -0.60),
            (0.74, -0.70, -0.40),
            (0.62, -1.40, -0.22),
            (0.82, -2.10, -0.12),
            (0.66, -2.80, -0.08),
            (0.70, -3.02, -0.04),
        ],
        [0.44, 0.68, 0.76, 0.66, 0.46, 0.26, 0.12],
        flatten=0.40,
        tilt=0.04,
    )
    return [top, nape_l, nape_r]


def _report(obj, label):
    xs, ys, zs = [], [], []
    for vertex in obj.data.vertices:
        q = _auth_of(obj.matrix_world @ vertex.co)
        xs.append(q[0]); ys.append(q[1]); zs.append(q[2])
    print(
        f"{label} bbox x[{min(xs):.2f},{max(xs):.2f}] "
        f"y[{min(ys):.2f},{max(ys):.2f}] z[{min(zs):.2f},{max(zs):.2f}]"
    )


def _guide():
    skin = lib.material("skin", (0.945, 0.710, 0.560), 0.80)
    cloth = lib.material("cloth", (0.085, 0.082, 0.088), 0.96)
    eye_mat = lib.material("eye", (0.145, 0.118, 0.110), 0.55)

    head = character.build_head()
    lib.assign(head, skin)
    head.name = "head"
    head.data.name = "head"

    body = character.build_body()
    lib.assign(body, skin)
    body.name = "body"
    body.data.name = "body"

    top = character.build_top()
    lib.assign(top, cloth)
    top.name = "top"
    top.data.name = "top"

    skin_z = character.front_z(head, character.EYE_X, character.EYE_Y)
    eye_front = skin_z + 0.016
    for side, tag in ((-1, "l"), (1, "r")):
        eye = lib.sphere_cage(
            20, 14,
            lambda d: character.to_blender((d.x * character.EYE_W, d.z * character.EYE_H, -d.y * character.EYE_D)),
        )
        lib.subsurf(eye, 2)
        lib.shaded_smooth(eye)
        eye.name = "eye_" + tag
        eye.data.name = "eye_" + tag
        eye.location = character.to_blender((side * character.EYE_X, character.EYE_Y, eye_front - character.EYE_D))
        lib.assign(eye, eye_mat)

        ear = lib.sphere_cage(
            16, 12,
            lambda d: character.to_blender((d.x * 0.045, d.z * 0.140, -d.y * 0.095)),
        )
        lib.subsurf(ear, 1)
        lib.shaded_smooth(ear)
        ear.name = "ear_" + tag
        ear.data.name = "ear_" + tag
        ear.location = character.to_blender((side * (character.axes_at(0.0)[0] - 0.035), 0.005, -0.130))
        lib.assign(ear, skin)
    return head


def sculpt():
    lib.reset()
    hair_mat = lib.material("hair", (0.210, 0.145, 0.125), 0.62)
    head = _guide()

    pieces = [build_scalp(), build_bang(head)]
    pieces.extend(build_left())
    pieces.extend(build_right())
    pieces.extend(build_back())
    for obj in pieces:
        lib.assign(obj, hair_mat)
        _report(obj, obj.name)

    # Never write the editable original or the shipped hair GLB.
    # Headless attempts land in generated/; a desktop sculptor edits BLEND.
    asset_paths.GENERATED.mkdir(parents=True, exist_ok=True)
    out = asset_paths.GENERATED / "sculpt_attempt.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    print(f"ATTEMPT {out} bytes={out.stat().st_size}")
    print(f"did not touch original {asset_paths.BLEND}")
    return pieces


if __name__ == "__main__":
    sculpt()
