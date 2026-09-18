"""Rebuild candidate hair as clay masses, not elliptical tubes.

Does not touch the protected original or public GLB.
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

# Front silhouette, author (y up, x right). Measured from the private still.
LEFT_SIL = [
    (1.65, -0.41), (1.50, -0.72), (1.35, -0.92), (1.20, -1.06),
    (1.05, -1.17), (0.90, -1.25), (0.70, -1.34), (0.50, -1.43),
    (0.30, -1.51), (0.10, -1.62), (-0.10, -1.68), (-0.30, -1.70),
    (-0.55, -1.68), (-0.80, -1.64), (-1.05, -1.67), (-1.30, -1.80),
    (-1.55, -2.02), (-1.80, -2.17), (-2.05, -2.21), (-2.30, -2.16),
    (-2.55, -2.18), (-2.80, -2.23), (-3.05, -2.26),
]
RIGHT_SIL = [
    (1.65, 0.19), (1.50, 0.54), (1.35, 0.85), (1.20, 1.03),
    (1.05, 1.13), (0.90, 1.19), (0.70, 1.28), (0.50, 1.33),
    (0.30, 1.38), (0.10, 1.43), (-0.10, 1.48), (-0.30, 1.53),
    (-0.55, 1.53), (-0.80, 1.46), (-1.05, 1.32), (-1.30, 1.35),
    (-1.55, 1.60), (-1.80, 1.87), (-2.05, 1.98), (-2.30, 1.97),
    (-2.55, 1.91), (-2.80, 1.90), (-3.05, 1.93),
]
# Visible bang / hairline. Part near x=+0.26, y=0.92; sweep to the left temple.
HAIRLINE = [
    (-0.90, 0.02), (-0.78, 0.08), (-0.66, 0.16), (-0.54, 0.24),
    (-0.42, 0.34), (-0.30, 0.46), (-0.18, 0.58), (-0.08, 0.70),
    (0.04, 0.82), (0.14, 0.90), (0.24, 0.94), (0.32, 0.92),
    (0.44, 0.84), (0.56, 0.70), (0.68, 0.50), (0.80, 0.28), (0.90, 0.08),
]


def _auth(co):
    return Vector((co.x, co.z, -co.y))


def _to_b(p):
    return Vector(character.to_blender((float(p[0]), float(p[1]), float(p[2]))))


def _lerp_sil(table, y):
    if y >= table[0][0]:
        return table[0][1]
    if y <= table[-1][0]:
        return table[-1][1]
    for i in range(len(table) - 1):
        y0, x0 = table[i]
        y1, x1 = table[i + 1]
        if y <= y0 and y >= y1:
            t = (y0 - y) / ((y0 - y1) or 1.0)
            t = t * t * (3.0 - 2.0 * t)
            return x0 + (x1 - x0) * t
    return table[-1][1]


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


def sit(head, x, y, clearance, prefer_z=0.70):
    best = None
    for vertex in head.data.vertices:
        q = _auth(head.matrix_world @ vertex.co)
        d = (q.x - x) ** 2 + (q.y - y) ** 2 + 0.28 * (q.z - prefer_z) ** 2
        if best is None or d < best[0]:
            best = (d, q)
    return Vector((x, y, best[1].z + clearance))


def mix(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = 0.0 if t < 0.0 else 1.0 if t > 1.0 else t
    return t * t * (3.0 - 2.0 * t)


def finish(obj, sub=2, relax=0.16):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    lib.subsurf(obj, sub)
    if relax:
        lib.relax(obj, relax, 2)
    lib.shaded_smooth(obj)
    obj.name = obj.data.name = obj.name
    return obj


def grid_shell(name, sample_outer, sample_inner, nu, nv):
    """Closed clay volume from outer / inner surfaces. Edges are the silhouette."""
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
    return finish(obj, sub=2, relax=0.14)


def sweep_box(name, sections, n_around=20, k=4.2):
    """Rounded-rectangle solid swept down y. k=2 is a tube; k>3 is a clay slab."""
    rings = []
    verts = []
    inv = 2.0 / k
    for y, x0, x1, z0, z1 in sections:
        cx = 0.5 * (x0 + x1)
        cz = 0.5 * (z0 + z1)
        hx = abs(x1 - x0) * 0.5
        hz = abs(z1 - z0) * 0.5
        ring = []
        for i in range(n_around):
            a = i / n_around * math.tau
            c, s = math.cos(a), math.sin(a)
            x = cx + hx * math.copysign(abs(c) ** inv, c)
            z = cz + hz * math.copysign(abs(s) ** inv, s)
            ring.append(len(verts))
            verts.append(_to_b((x, y, z)))
        rings.append(ring)
    faces = []
    for i in range(len(rings) - 1):
        for kpt in range(n_around):
            a = rings[i][kpt]
            b = rings[i][(kpt + 1) % n_around]
            c = rings[i + 1][(kpt + 1) % n_around]
            d = rings[i + 1][kpt]
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(rings[0])))
    faces.append(tuple(rings[-1]))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, sub=2, relax=0.15)


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


def _taper_cap(sections):
    """Tiny first ring so the top cap rounds into a dome, not a cut box."""
    y, x0, x1, z0, z1 = sections[0]
    cx, cz = 0.5 * (x0 + x1), 0.5 * (z0 + z1)
    cap = (
        y + 0.08,
        mix(cx, x0, 0.22),
        mix(cx, x1, 0.22),
        mix(cz, z0, 0.22),
        mix(cz, z1, 0.22),
    )
    return [cap, sections[0]] + list(sections[1:])


def _with_sil(sections, sil, sign):
    """Keep authored inner/front/back; outer x follows the measured silhouette."""
    out = []
    for y, x_in, _x_out, z_b, z_f in sections:
        x_out = _lerp_sil(sil, y)
        # Keep the authored outer when it is more extreme (bang reach, wave).
        if sign < 0:
            x_out = min(x_out, _x_out)
        else:
            x_out = max(x_out, _x_out)
        out.append((y, x_in, x_out, z_b, z_f))
    return _taper_cap(out)


def build_bang(head):
    """Organic hairline on top of the left mass. Points stay on the head."""

    def sample(u, v, outer):
        t = smooth(u)
        vv = smooth(v)
        x_hl = mix(0.26, -0.94, t)
        y_hl = hairline_y(x_hl) - 0.22 * (t ** 1.35)
        x_up = mix(0.20, -0.78, t)
        y_up = mix(1.18, 0.55, t)
        x = mix(x_hl, x_up, vv)
        y = mix(y_hl, y_up, vv)
        prefer_hl = mix(0.86, 0.32, t)
        prefer_up = mix(0.28, 0.02, t)
        prefer = mix(prefer_hl, prefer_up, vv)
        bulge = math.sin(math.pi * min(1.0, t / 0.9)) * math.sin(vv * math.pi)
        # Thin lip at the hairline, puff behind it so the front is a mass not a visor edge.
        if outer:
            clearance = 0.08 + 0.10 * vv + 0.16 * bulge
        else:
            clearance = 0.04
        return sit(head, x, y, clearance, prefer_z=prefer)

    return grid_shell(
        "hair_bang",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=24,
        nv=10,
    )


def build_sides():
    # y, x_in, x_out, z_back, z_front
    # Left top spans part → temple IN FRONT of the forehead so the bang is
    # the front of this mass, not a separate headband.
    left_keys = [
        (1.30,  0.20, -0.55, -1.02, 0.38),
        (1.12,  0.26, -0.78, -1.14, 0.58),
        (0.92,  0.22, -0.98, -1.20, 0.68),
        (0.70,  0.06, -1.12, -1.22, 0.58),
        (0.42, -0.22, -1.28, -1.18, 0.42),
        (0.12, -0.52, -1.48, -1.14, 0.36),
        (-0.18, -0.58, -1.58, -1.10, 0.30),
        (-0.52, -0.50, -1.62, -1.04, 0.26),
        (-0.88, -0.44, -1.64, -0.98, 0.22),
        (-1.25, -0.40, -1.72, -0.90, 0.20),
        (-1.62, -0.40, -2.00, -0.80, 0.22),
        (-1.98, -0.42, -2.18, -0.66, 0.18),
        (-2.32, -0.40, -2.18, -0.50, 0.12),
        (-2.64, -0.38, -2.20, -0.34, 0.08),
        (-3.04, -0.36, -2.22, -0.20, 0.04),
    ]
    right_keys = [
        (1.30,  0.18,  0.50, -1.02, 0.28),
        (1.12,  0.22,  0.72, -1.14, 0.42),
        (0.92,  0.28,  0.95, -1.20, 0.48),
        (0.70,  0.42,  1.12, -1.22, 0.44),
        (0.42,  0.62,  1.28, -1.18, 0.38),
        (0.12,  0.78,  1.42, -1.14, 0.32),
        (-0.18, 0.58,  1.50, -1.10, 0.28),
        (-0.52, 0.48,  1.52, -1.04, 0.24),
        (-0.88, 0.42,  1.46, -0.98, 0.20),
        (-1.25, 0.40,  1.38, -0.90, 0.18),
        (-1.62, 0.40,  1.70, -0.80, 0.20),
        (-1.98, 0.42,  1.92, -0.66, 0.16),
        (-2.32, 0.40,  1.92, -0.50, 0.10),
        (-2.64, 0.38,  1.88, -0.34, 0.06),
        (-3.04, 0.36,  1.90, -0.20, 0.04),
    ]
    left = sweep_box("hair_side_l", _with_sil(left_keys, LEFT_SIL, -1), n_around=24, k=4.8)
    right = sweep_box("hair_side_r", _with_sil(right_keys, RIGHT_SIL, 1), n_around=24, k=4.8)
    return [left, right]


def build_back():
    # Behind the skull (head back is z~-0.86). Wide enough that the back view
    # is a mass, not a hole between two side slabs.
    keys = [
        (1.30, 0.28, -1.08, -0.55),
        (1.12, 0.70, -1.22, -0.42),
        (0.82, 0.88, -1.28, -0.38),
        (0.45, 0.96, -1.24, -0.32),
        (0.05, 1.00, -1.16, -0.26),
        (-0.40, 1.02, -1.06, -0.20),
        (-0.90, 0.98, -0.94, -0.16),
        (-1.40, 0.92, -0.80, -0.12),
        (-1.90, 0.86, -0.64, -0.08),
        (-2.35, 0.80, -0.48, -0.04),
        (-2.75, 0.74, -0.34, 0.00),
        (-3.05, 0.68, -0.22, 0.02),
    ]
    sections = []
    for i, (y, half, z_b, z_f) in enumerate(keys):
        t = i / (len(keys) - 1)
        wave = 0.05 * math.sin(t * math.pi * 1.15)
        sections.append((y, -half + wave, half + wave, z_b, z_f))
    return sweep_box("hair_back", _taper_cap(sections), n_around=24, k=4.5)


def build_crown(head):
    """Rounded top with a part. Stays on the crown; bang owns the forehead."""

    def sample(u, v, outer):
        x = mix(-0.72, 0.76, u)
        part = math.exp(-((x - 0.22) ** 2) / 0.038)
        y_front = 0.98 + 0.04 * part
        y_crown = 1.28 - 0.05 * part
        y_nape = 0.62
        if v < 0.40:
            y = mix(y_front, y_crown, smooth(v / 0.40))
        else:
            y = mix(y_crown, y_nape, smooth((v - 0.40) / 0.60))
        prefer = mix(0.08, -0.78, v)
        groove = 0.06 * part * (1.0 if outer else 0.35)
        clearance = (0.14 if outer else 0.055) - groove
        p = sit(head, x, y, clearance, prefer_z=prefer)
        if v < 0.22:
            p.z = min(p.z, 0.18)
        return p

    return grid_shell(
        "hair_crown",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=18,
        nv=12,
    )


def main():
    head = find_head()
    remove_hair()
    hair_mat = bpy.data.materials.get("hair")
    if hair_mat is None:
        hair_mat = lib.material("hair", (0.210, 0.145, 0.125), 0.62)
    pieces = [
        build_crown(head),
        build_bang(head),
        build_back(),
    ]
    pieces.extend(build_sides())
    for obj in pieces:
        lib.assign(obj, hair_mat)
        print("piece", obj.name, "verts", len(obj.data.vertices))
    CANDIDATE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("SAVED", BLEND, "pieces", len(pieces))


if __name__ == "__main__":
    main()
