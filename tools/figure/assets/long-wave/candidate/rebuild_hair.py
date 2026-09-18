"""Sculpt the candidate as one long-wave style.

Does not touch the protected original or public GLB.
Long-length checkpoint is checkpoint-8fbe93b / git 8fbe93b.
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


def _auth(co):
    return Vector((co.x, co.z, -co.y))


def _to_b(p):
    return Vector(character.to_blender((float(p[0]), float(p[1]), float(p[2]))))


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


def wrap_az(az):
    a = az % math.tau
    if a > math.pi:
        a -= math.tau
    return a


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
            verts.append(_to_b(sample_outer(u, v)))
    inner_off = len(verts)
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            u = i / (nu - 1)
            verts.append(_to_b(sample_inner(u, v)))
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


def _lobe_along(a, a_start, a_end):
    """Cover (surface extent) and volume (convex pad) along the bang face."""
    span = a_start - a_end
    if span <= 1e-6 or a > a_start or a < a_end:
        return 0.0, 0.0
    s = (a_start - a) / span
    mid = 0.36
    if s < mid:
        vol = mix(0.92, 1.0, smooth(s / mid))
    else:
        vol = mix(1.0, 0.20, smooth((s - mid) / (1.0 - mid)))
    if s < 0.82:
        cover = 1.0
    else:
        cover = mix(1.0, 0.55, smooth((s - 0.82) / 0.18))
    return cover, vol


def _lobe_right(a, a_start, a_end):
    """Smaller right-of-part pad, start at the part, end at the right temple."""
    span = a_end - a_start
    if span <= 1e-6:
        return 0.0
    if a < a_start or a > a_end:
        return 0.0
    s = (a - a_start) / span
    mid = 0.32
    if s < mid:
        return mix(0.70, 0.82, smooth(s / mid))
    return mix(0.82, 0.0, smooth((s - mid) / (1.0 - mid)))


def build_top(head):
    """Crown and bang as one surface: wide start, convex middle, temple end."""

    def sample(u, v, outer):
        az = math.pi + u * math.tau
        a = wrap_az(az)
        backness = 0.5 - 0.5 * math.cos(az)
        # Part sits slightly to the character's right of centre.
        bang_cover, bang_vol = _lobe_along(a, 0.40, -1.38)
        right = _lobe_right(a, 0.28, 1.18)
        s_bang = 0.0
        if -1.38 <= a <= 0.40:
            s_bang = (0.40 - a) / (0.40 - (-1.38))
        # Diagonal: high at the part, lower toward the left temple. Not a visor lip.
        polar_extra = mix(0.16, 0.88, smooth(s_bang)) * bang_cover
        polar_rim = mix(0.48, 0.58, backness) + polar_extra + 0.26 * right
        polar = mix(0.05, polar_rim, v)
        along = math.sin(v * math.pi)
        clr = 0.26 + 0.16 * bang_vol * along + 0.06 * right * v
        if not outer:
            clr = 0.08 + 0.04 * bang_vol * along
        part = math.exp(-(a - 0.34) ** 2 / 0.16) * (1.0 - v * 0.35)
        clr -= 0.018 * part * (1.0 if outer else 0.4)
        p = on_head(
            math.sin(polar) * math.sin(az),
            math.cos(polar),
            math.sin(polar) * math.cos(az),
            clr,
        )
        drop = bang_cover * v * mix(0.02, 0.26, s_bang)
        p = Vector((
            p.x - 0.08 * drop,
            p.y - drop,
            p.z + 0.04 * bang_vol * along - 0.08 * s_bang * v,
        ))
        return p

    return grid_shell(
        "hair_top",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=28,
        nv=14,
    )


def _curtain_az(u):
    left_front = -1.02
    right_front = 1.00
    back_span = math.tau - (right_front - left_front)
    return left_front - u * back_span


def _lock_wave(u, t):
    """A few large locks. Shared phase so the wave is a big curve, not ripples."""
    locks = (
        (0.10, 0.20, 0.20),
        (0.30, 0.18, 0.70),
        (0.70, 0.18, 1.10),
        (0.90, 0.20, 1.55),
    )
    d_az = d_r = d_z = 0.0
    for center, sigma, phase in locks:
        w = math.exp(-((u - center) / sigma) ** 2)
        s = math.sin(t * math.pi * 1.06 + phase)
        c = math.cos(t * math.pi * 1.02 + phase)
        d_az += w * 0.34 * s
        d_r += w * 0.18 * s
        d_z += w * 0.20 * c
    return d_az, d_r, d_z


def build_hang():
    """Long length kept. Large lock waves along that length. Back follows sides."""

    def sample(u, v, outer):
        backness = math.sin(u * math.pi)
        edge = 1.0 - backness
        az0 = _curtain_az(u)
        v_leave = mix(0.20, 0.38, backness)
        polar0 = mix(0.48, 0.16, backness)
        polar1 = mix(1.12, 1.32, backness)
        clr = (0.27 if outer else 0.08) * mix(1.05, 0.95, backness)

        tv_head = min(1.0, v / max(1e-6, v_leave))
        polar = mix(polar0, polar1, smooth(tv_head))
        head_p = on_head(
            math.sin(polar) * math.sin(az0),
            math.cos(polar),
            math.sin(polar) * math.cos(az0),
            clr,
        )
        if v <= v_leave:
            return head_p

        t = (v - v_leave) / (1.0 - v_leave)
        d_az, d_r, d_z = _lock_wave(u, t)
        az = az0 + d_az
        y = mix(head_p.y, -3.12, t)
        r0 = math.hypot(head_p.x, head_p.z)
        # Width grows then tapers along the lock. Cap keeps the shoulder plate off.
        r = r0 + 0.05 * math.sin(t * math.pi) + d_r
        r -= 0.09 * math.exp(-((u - 0.5) / 0.14) ** 2) * math.sin(min(1.0, t / 0.35) * math.pi)
        r = min(max(r, 0.70), 1.22)
        thick = mix(0.30, 0.12, smooth(max(0.0, (t - 0.58) / 0.42)))
        thick *= mix(0.90, 1.08, edge)
        if not outer:
            r = max(0.40, r - thick)
        x = r * math.sin(az)
        z = r * math.cos(az) + d_z
        sx = mix(-1.0, 1.0, u)
        x += 0.20 * sx * math.sin(t * math.pi * 1.10 + mix(0.18, 1.45, u))
        if t < 0.42:
            z += (0.16 if outer else 0.06) * edge * math.sin(math.pi * t / 0.42)
        return Vector((x, y, z))

    return grid_shell(
        "hair_hang",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=28,
        nv=20,
    )


def main():
    head = find_head()
    remove_hair()
    hair_mat = bpy.data.materials.get("hair")
    if hair_mat is None:
        hair_mat = lib.material("hair", (0.210, 0.145, 0.125), 0.62)
    pieces = [build_top(head), build_hang()]
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
    )
    CANDIDATE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("SAVED", BLEND, "pieces", len(pieces))


if __name__ == "__main__":
    main()
