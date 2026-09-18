"""Sculpt the candidate from the long-wave turnaround sheet.

Does not touch the protected original or public GLB.

Open scalp (face window, not a visor cap). Bang is a forehead pad from the
side part to the left temple. Sides and back are overlapping S-locks that
start on the crown and tuck behind the ears. Inner nape fill so the skull
does not show. No voxel fuse. No crown-petal sausages.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path("/workspace/tools/figure")
sys.path.insert(0, str(ROOT))
import character  # noqa: E402
import lib  # noqa: E402

CANDIDATE = ROOT / "assets/long-wave/candidate"
BLEND = CANDIDATE / "hair_long_wave.blend"
Y_TIP = -2.88
PART = (0.26, 0.94, 0.06)


def _auth(co):
    return Vector((co.x, co.z, -co.y))


def mix(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = 0.0 if t < 0.0 else 1.0 if t > 1.0 else t
    return t * t * (3.0 - 2.0 * t)


def on_head(x, y, z, clearance):
    r = math.sqrt(x * x + y * y + z * z) or 1.0
    p = character.head_surface((x / r, y / r, z / r))
    n = math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) or 1.0
    return Vector((
        p[0] + p[0] / n * clearance,
        p[1] + p[1] / n * clearance,
        p[2] + p[2] / n * clearance,
    ))


def sit(x, y, z, clearance):
    p = on_head(x, y, z, clearance)
    return (p.x, p.y, p.z)


def bang_pt(x, y, clearance, z_guess=0.78):
    """Centreline in front of the forehead, not a radial visor rim."""
    r = math.sqrt(x * x + y * y + z_guess * z_guess) or 1.0
    surface = character.head_surface((x / r, y / r, z_guess / r))
    return (x, y, surface[2] + clearance)


def finish(obj, sub=1, relax=0.16):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if sub:
        lib.subsurf(obj, sub)
    if relax:
        lib.relax(obj, relax, 2)
    lib.shaded_smooth(obj)
    obj.name = obj.data.name = obj.name
    return obj


def grid_shell(name, sample_outer, sample_inner, nu, nv):
    verts = []
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            u = i / (nu - 1)
            verts.append(Vector(character.to_blender(tuple(sample_outer(u, v)))))
    inner_off = len(verts)
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            u = i / (nu - 1)
            verts.append(Vector(character.to_blender(tuple(sample_inner(u, v)))))
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
    return finish(obj, sub=2, relax=0.16)


def lock(name, path, widths, flatten=0.58, tilt=0.06, resolution=18):
    obj = lib.ribbon(
        name,
        [character.to_blender(p) for p in path],
        widths,
        flatten=flatten,
        tilt=tilt,
        resolution=resolution,
    )
    obj.name = obj.data.name = name
    lib.relax(obj, 0.18, 2)
    lib.shaded_smooth(obj)
    return obj


def bounds(obj):
    xs, ys, zs = [], [], []
    for v in obj.data.vertices:
        p = _auth(obj.matrix_world @ v.co)
        xs.append(p.x)
        ys.append(p.y)
        zs.append(p.z)
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def remove_hair():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith("hair"):
            bpy.data.objects.remove(obj, do_unlink=True)


def find_head():
    for name in ("head", "cage"):
        if name in bpy.data.objects:
            obj = bpy.data.objects[name]
            ys = [_auth(obj.matrix_world @ v.co).y for v in obj.data.vertices]
            if ys and max(ys) > 0.4:
                return obj
    raise SystemExit("no head mesh")


def _smooth_rim(obj, rounds=8, factor=0.55):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for _ in range(rounds):
        boundary = [v for v in bm.verts if v.is_boundary]
        stored = {v: v.co.copy() for v in boundary}
        for vertex in boundary:
            linked = [
                e.other_vert(vertex)
                for e in vertex.link_edges
                if e.other_vert(vertex).is_boundary
            ]
            if not linked:
                continue
            acc = stored[vertex].copy()
            for other in linked:
                acc += stored[other]
            vertex.co = acc / (1 + len(linked))
            vertex.co = vertex.co.lerp(stored[vertex], 1.0 - factor)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def build_scalp():
    """Thin open cap. Forehead is a window; the bang fills it."""
    offset = 0.088

    def shape(d):
        p = character.head_surface((d.x, d.z, -d.y))
        r = math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) or 1.0
        q = (
            p[0] + p[0] / r * offset,
            p[1] + p[1] / r * offset,
            p[2] + p[2] / r * offset,
        )
        return character.to_blender(q)

    obj = lib.sphere_cage(48, 32, shape)
    obj.name = obj.data.name = "hair_scalp"

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    kill = []
    for vertex in bm.verts:
        q = _auth(vertex.co)
        nape = q[2] < -0.08 and q[1] > -0.22
        crown = q[1] > 0.42
        side = abs(q[0]) > 0.40 and q[1] > 0.16 and q[2] < 0.22
        hairline = 0.78 + 0.12 * max(0.0, q[0])
        face = q[2] > 0.14 and q[1] < hairline
        if (not (nape or crown or side)) or face:
            kill.append(vertex)
    if kill:
        bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    lib.solidify(obj, thickness=0.070, offset=1.0)
    _smooth_rim(obj)
    lib.relax(obj, 0.22, 1)
    lib.shaded_smooth(obj)
    obj.name = obj.data.name = "hair_scalp"
    return obj


def build_bang():
    """Wide diagonal forehead pad. Overlaps the scalp rim; sits on the skin."""

    def sample(u, v, outer):
        az = mix(0.88, -1.58, u)
        polar_fringe = mix(0.84, 1.32, smooth(u))
        polar = mix(0.24, polar_fringe, v ** 0.62)
        mid = math.sin(max(0.0, v - 0.04) * math.pi / 0.96) * math.sin(
            math.pi * mix(0.10, 0.96, u)
        )
        vol = 0.070 + 0.150 * mid
        if u < 0.10:
            vol *= mix(0.48, 1.0, u / 0.10)
        if u > 0.88:
            vol *= mix(1.0, 0.50, (u - 0.88) / 0.12)
        fringe = smooth((v - 0.58) / 0.42) if v > 0.58 else 0.0
        vol = mix(vol, 0.008, fringe ** 0.65)
        inner = max(0.006, vol * 0.30)
        clr = vol if outer else inner
        if v > 0.90:
            meet = (v - 0.90) / 0.10
            inner = mix(inner, 0.006, meet)
            clr = 0.006 if not outer else mix(clr, 0.006, meet)
        part = math.exp(-((az - 0.30) ** 2) / 0.12) * (1.0 - 0.40 * v)
        clr = max(0.006, clr - 0.028 * part)
        p = on_head(
            math.sin(polar) * math.sin(az),
            math.cos(polar),
            math.sin(polar) * math.cos(az),
            clr,
        )
        puff = mid * (1.0 - fringe) * 0.055
        wrap = u * v
        return Vector((p.x - 0.07 * wrap, p.y - 0.05 * wrap, p.z + puff - 0.02 * wrap))

    return grid_shell(
        "hair_bang",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=20,
        nv=14,
    )


def build_front():
    """전면 레이어: temple roots (no crown horns), tuck behind ears, long S."""
    left = lock(
        "hair_front_l",
        [
            sit(-0.22, 0.72, 0.08, 0.06),
            sit(-0.42, 0.52, 0.28, 0.10),
            sit(-0.74, 0.14, -0.12, 0.12),
            (-0.94, -0.40, 0.06),
            (-0.74, -1.00, 0.20),
            (-1.04, -1.60, 0.00),
            (-0.82, -2.16, 0.14),
            (-0.92, Y_TIP, 0.00),
        ],
        [0.34, 0.72, 0.98, 1.00, 0.88, 0.72, 0.46, 0.16],
        flatten=0.58,
        tilt=[0.06, 0.10, 0.08, 0.12, 0.06, 0.04, 0.02],
    )
    left2 = lock(
        "hair_front_l2",
        [
            sit(-0.40, 0.58, -0.04, 0.08),
            sit(-0.70, 0.16, -0.20, 0.12),
            (-0.90, -0.48, -0.02),
            (-0.72, -1.08, 0.12),
            (-0.98, -1.66, -0.04),
            (-0.78, -2.20, 0.10),
            (-0.86, Y_TIP + 0.06, -0.02),
        ],
        [0.28, 0.62, 0.82, 0.74, 0.58, 0.34, 0.12],
        flatten=0.60,
        tilt=0.06,
    )
    right = lock(
        "hair_front_r",
        [
            sit(0.32, 0.68, -0.10, 0.06),
            sit(0.58, 0.46, 0.12, 0.10),
            sit(0.82, 0.12, -0.16, 0.12),
            (0.96, -0.40, -0.02),
            (0.76, -1.00, 0.16),
            (1.04, -1.60, -0.04),
            (0.82, -2.16, 0.12),
            (0.92, Y_TIP, -0.02),
        ],
        [0.30, 0.66, 0.92, 0.94, 0.82, 0.66, 0.42, 0.14],
        flatten=0.58,
        tilt=[0.06, 0.10, 0.08, 0.12, 0.06, 0.04, 0.02],
    )
    right2 = lock(
        "hair_front_r2",
        [
            sit(0.44, 0.58, -0.08, 0.08),
            sit(0.76, 0.16, -0.24, 0.12),
            (0.92, -0.48, -0.06),
            (0.74, -1.08, 0.10),
            (0.98, -1.66, -0.06),
            (0.80, -2.20, 0.08),
            (0.86, Y_TIP + 0.06, -0.04),
        ],
        [0.26, 0.58, 0.78, 0.70, 0.54, 0.32, 0.12],
        flatten=0.60,
        tilt=0.06,
    )
    return [left, left2, right, right2]


def build_mid():
    """중간 레이어: same S phase, rooted behind the ears."""
    left = lock(
        "hair_mid_l",
        [
            sit(-0.36, 0.58, -0.28, 0.14),
            sit(-0.66, 0.18, -0.18, 0.13),
            (-0.86, -0.36, -0.04),
            (-0.68, -0.96, 0.14),
            (-0.94, -1.56, -0.04),
            (-0.74, -2.12, 0.12),
            (-0.84, Y_TIP + 0.04, 0.00),
        ],
        [0.60, 0.84, 0.92, 0.82, 0.66, 0.42, 0.14],
        flatten=0.62,
    )
    right = lock(
        "hair_mid_r",
        [
            sit(0.42, 0.58, -0.30, 0.14),
            sit(0.72, 0.18, -0.22, 0.13),
            (0.90, -0.36, -0.08),
            (0.72, -0.96, 0.12),
            (0.96, -1.56, -0.06),
            (0.76, -2.12, 0.10),
            (0.86, Y_TIP + 0.04, -0.02),
        ],
        [0.56, 0.80, 0.88, 0.78, 0.62, 0.40, 0.14],
        flatten=0.62,
    )
    return [left, right]


def build_back():
    """후면 레이어: shared Z-phase S so ridges read, not a column or zipper."""
    specs = [
        (
            "hair_back_l",
            [
                sit(-0.38, 0.90, -0.38, 0.16),
                (-0.52, 0.36, -0.86),
                (-0.34, -0.24, -0.48),
                (-0.60, -0.88, -0.90),
                (-0.40, -1.48, -0.46),
                (-0.56, -2.06, -0.78),
                (-0.44, -2.52, -0.38),
                (-0.50, Y_TIP, -0.24),
            ],
            [0.82, 1.08, 1.16, 1.10, 0.94, 0.74, 0.46, 0.16],
        ),
        (
            "hair_back_c",
            [
                sit(0.02, 0.92, -0.40, 0.16),
                (0.04, 0.38, -0.90),
                (-0.02, -0.22, -0.50),
                (0.06, -0.86, -0.94),
                (0.00, -1.46, -0.48),
                (0.06, -2.04, -0.82),
                (0.02, -2.52, -0.40),
                (0.02, Y_TIP, -0.22),
            ],
            [0.96, 1.22, 1.28, 1.20, 1.04, 0.82, 0.50, 0.18],
        ),
        (
            "hair_back_r",
            [
                sit(0.40, 0.90, -0.38, 0.16),
                (0.54, 0.36, -0.86),
                (0.36, -0.24, -0.48),
                (0.62, -0.88, -0.90),
                (0.42, -1.48, -0.46),
                (0.58, -2.06, -0.78),
                (0.46, -2.52, -0.38),
                (0.52, Y_TIP, -0.24),
            ],
            [0.82, 1.08, 1.16, 1.10, 0.94, 0.74, 0.46, 0.16],
        ),
    ]
    out = []
    for name, path, widths in specs:
        out.append(lock(name, path, widths, flatten=0.66, tilt=0.04, resolution=18))
    return out


def build_occipital():
    """Back-of-head clay pad so the showroom back is not a bald skull under a lid."""

    def sample(u, v, outer):
        az = math.pi + mix(-1.28, 1.28, u)
        polar = mix(0.28, 2.18, v ** 0.82)
        mid = math.sin(v * math.pi)
        vol = 0.12 + 0.07 * mid
        wave = 0.10 * math.sin(v * math.pi * 3.0) * smooth(v)
        if u < 0.08:
            vol *= mix(0.55, 1.0, u / 0.08)
        if u > 0.92:
            vol *= mix(1.0, 0.55, (u - 0.92) / 0.08)
        inner = max(0.022, vol * 0.34)
        clr = vol if outer else inner
        p = on_head(
            math.sin(polar) * math.sin(az),
            math.cos(polar),
            math.sin(polar) * math.cos(az),
            clr,
        )
        return Vector((p.x, p.y, p.z - wave))

    return grid_shell(
        "hair_occipital",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=18,
        nv=12,
    )


def build_inner():
    """내부 볼륨(뒷면): wide nape mass in the same S, fills lock gaps."""
    return lock(
        "hair_inner",
        [
            sit(0.02, 0.86, -0.32, 0.14),
            (0.02, 0.32, -0.72),
            (0.00, -0.28, -0.46),
            (0.04, -0.92, -0.78),
            (0.00, -1.52, -0.42),
            (0.04, -2.10, -0.68),
            (0.02, Y_TIP + 0.04, -0.28),
        ],
        [1.12, 1.42, 1.52, 1.44, 1.22, 0.86, 0.38],
        flatten=0.72,
        tilt=0.03,
        resolution=18,
    )


def main():
    head = find_head()
    remove_hair()
    hair_mat = bpy.data.materials.get("hair")
    if hair_mat is None:
        hair_mat = lib.material("hair", (0.210, 0.145, 0.125), 0.62)
    pieces = [build_scalp(), build_bang(), build_occipital(), build_inner()]
    pieces.extend(build_front())
    pieces.extend(build_mid())
    pieces.extend(build_back())
    for obj in pieces:
        lib.assign(obj, hair_mat)
        b = bounds(obj)
        print(
            "piece",
            obj.name,
            "verts",
            len(obj.data.vertices),
            "x",
            f"{b[0]:.2f}:{b[1]:.2f}",
            "y",
            f"{b[2]:.2f}:{b[3]:.2f}",
            "z",
            f"{b[4]:.2f}:{b[5]:.2f}",
        )
    xs, ys, zs = [], [], []
    for obj in pieces:
        b = bounds(obj)
        xs += [b[0], b[1]]
        ys += [b[2], b[3]]
        zs += [b[4], b[5]]
    print(
        "HAIR_AABB",
        "x",
        f"{min(xs):.2f}:{max(xs):.2f}",
        "y",
        f"{min(ys):.2f}:{max(ys):.2f}",
        "z",
        f"{min(zs):.2f}:{max(zs):.2f}",
        "pieces",
        len(pieces),
    )
    CANDIDATE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("SAVED", BLEND, "pieces", len(pieces))


if __name__ == "__main__":
    main()
