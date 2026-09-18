"""Rebuild candidate hair as hanging oval locks, not y-sliced plates.

Does not touch the protected original or public GLB.
Previous plate candidate is checkpoint-b5d56d2 / git b5d56d2.

Volume is parameterized along lock length. Side width is not taken from
the clothes/shoulder silhouette. Cross-section is an ellipse (not a
rounded rectangle, not a circle).
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
    return finish(obj, sub=2, relax=0.14)


def loft_oval(name, spine, widths, thicks, nu=16, roll=0.0):
    """Solid ellipse swept along a 3D spine in author space.

    Width and thickness are full diameters. Section is an ellipse, not a
    superellipse plate and not a circle. Frames follow the spine so a hanging
    lock stays oval in the plane perpendicular to its length.
    """
    pts = [Vector((float(p[0]), float(p[1]), float(p[2]))) for p in spine]
    n = len(pts)
    if n < 2:
        raise SystemExit("spine too short")
    if len(widths) != n or len(thicks) != n:
        raise SystemExit("widths/thicks must match spine")

    tangents = []
    for i in range(n):
        if i == 0:
            d = pts[1] - pts[0]
        elif i == n - 1:
            d = pts[n - 1] - pts[n - 2]
        else:
            d = pts[i + 1] - pts[i - 1]
        if d.length < 1e-8:
            d = Vector((0.0, -1.0, 0.0))
        tangents.append(d.normalized())

    normals = []
    binormals = []
    t0 = tangents[0]
    ref = Vector((0.0, 0.0, 1.0))
    if abs(t0.dot(ref)) > 0.92:
        ref = Vector((1.0, 0.0, 0.0))
    n0 = t0.cross(ref)
    if n0.length < 1e-6:
        n0 = t0.cross(Vector((0.0, 1.0, 0.0)))
    n0.normalize()
    b0 = n0.cross(t0).normalized()
    normals.append(n0)
    binormals.append(b0)
    for i in range(1, n):
        t = tangents[i]
        b = binormals[i - 1] - t * binormals[i - 1].dot(t)
        if b.length < 0.12:
            b = t.cross(normals[i - 1])
        b.normalize()
        nn = t.cross(b)
        if nn.length < 1e-6:
            nn = normals[i - 1]
        else:
            nn.normalize()
        b = nn.cross(t).normalized()
        normals.append(nn)
        binormals.append(b)

    rolls = [roll] * n if isinstance(roll, (int, float)) else list(roll)
    if len(rolls) < n:
        rolls = rolls + [rolls[-1]] * (n - len(rolls))

    verts = []
    for i, p in enumerate(pts):
        ca, sa = math.cos(rolls[i]), math.sin(rolls[i])
        B = binormals[i] * ca + normals[i] * sa
        N = normals[i] * ca - binormals[i] * sa
        hw, ht = 0.5 * widths[i], 0.5 * thicks[i]
        for j in range(nu):
            a = (j / nu) * math.tau
            q = p + B * (hw * math.cos(a)) + N * (ht * math.sin(a))
            verts.append(_to_b(q))

    faces = []
    for i in range(n - 1):
        for j in range(nu):
            a = i * nu + j
            b = i * nu + (j + 1) % nu
            c = (i + 1) * nu + (j + 1) % nu
            d = (i + 1) * nu + j
            faces.append((a, b, c, d))
    faces.append(tuple(range(nu - 1, -1, -1)))
    faces.append(tuple(range((n - 1) * nu, n * nu)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, sub=1, relax=0.14)


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


def build_crown(head):
    """Top of the skull only. Sides and nape belong to the hanging mass."""

    def sample(u, v, outer):
        az = math.pi + u * math.tau * 1.02
        backness = 0.5 - 0.5 * math.cos(az)
        polar = mix(0.05, mix(0.52, 0.82, backness), v)
        x = math.sin(polar) * math.sin(az)
        y = math.cos(polar)
        z = math.sin(polar) * math.cos(az)
        az_w = az % math.tau
        part = math.exp(-((az_w - 0.32) ** 2) / 0.20)
        groove = 0.016 * part * (1.0 - v)
        clearance = (0.26 if outer else 0.07) - groove * (1.0 if outer else 0.35)
        return on_head(x, y, z, clearance)

    return grid_shell(
        "hair_crown",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=22,
        nv=10,
    )


def build_bang():
    """Volume starts at the part and runs as a wide diagonal to the left temple."""
    bang = loft_oval(
        "hair_bang",
        [
            (0.18, 1.00, 0.14),
            (0.06, 0.86, 0.40),
            (-0.10, 0.66, 0.66),
            (-0.28, 0.44, 0.68),
            (-0.48, 0.18, 0.48),
            (-0.64, -0.08, 0.26),
            (-0.74, -0.28, 0.10),
        ],
        [0.64, 0.78, 0.82, 0.72, 0.52, 0.34, 0.18],
        [0.34, 0.38, 0.36, 0.32, 0.24, 0.16, 0.10],
        nu=16,
        roll=[-0.06, -0.18, -0.32, -0.38, -0.22, -0.10, -0.02],
    )
    return [bang]


def _curtain_az(u):
    """u=0 left front, u=0.5 back, u=1 right front. Face stays open."""
    left_front = -0.98
    right_front = 0.96
    back_span = math.tau - (right_front - left_front)
    return left_front - u * back_span


def build_hang():
    """Sides and back as one mass: follow the skull, then hang with a long S.

    Temple fibers start at the temple, not as a hood over the crown.
    Radial size stays near the head, not the clothes/shoulder outline.
    """

    def sample(u, v, outer):
        backness = math.sin(u * math.pi)
        edge = 1.0 - backness
        az0 = _curtain_az(u)
        v_leave = mix(0.24, 0.42, backness)
        polar0 = mix(0.70, 0.24, backness)
        polar1 = mix(1.12, 1.34, backness)
        clr = (0.26 if outer else 0.08) * mix(1.06, 0.94, backness)

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
        az = az0 + mix(0.30, 0.12, backness) * math.sin(t * math.pi * 1.35 + u * 2.05)
        y = mix(head_p.y, -3.12, t)
        r0 = math.hypot(head_p.x, head_p.z)
        r = r0 + 0.04 * t + mix(0.18, 0.10, backness) * math.sin(
            t * math.pi * 1.32 + u * 1.45
        )
        r = min(max(r, 0.70), 1.16)
        thick = mix(0.28, 0.12, smooth(max(0.0, (t - 0.55) / 0.45)))
        if not outer:
            r = max(0.40, r - thick)
        x = r * math.sin(az)
        z = r * math.cos(az)
        if t < 0.48:
            z += (0.22 if outer else 0.08) * edge * math.sin(math.pi * t / 0.48)
        else:
            z += 0.09 * math.sin((t - 0.48) * math.pi * 1.15) * mix(0.25, 1.0, backness)
        return Vector((x, y, z))

    curtain = grid_shell(
        "hair_hang",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=26,
        nv=18,
    )
    # Extra lock beside the cheek so the front edge is hair flow, not a hole.
    left_face = loft_oval(
        "hair_side_l_face",
        [
            (-0.52, 0.52, 0.38),
            (-0.70, 0.18, 0.50),
            (-0.82, -0.08, 0.46),
            (-0.78, -0.62, 0.28),
            (-0.90, -1.28, 0.20),
            (-0.82, -1.95, 0.10),
            (-0.94, -2.60, 0.04),
            (-0.86, -3.10, 0.00),
        ],
        [0.40, 0.52, 0.56, 0.50, 0.42, 0.32, 0.20, 0.12],
        [0.26, 0.32, 0.34, 0.30, 0.24, 0.18, 0.12, 0.08],
        nu=14,
        roll=0.08,
    )
    right_face = loft_oval(
        "hair_side_r_face",
        [
            (0.54, 0.48, 0.30),
            (0.72, 0.14, 0.40),
            (0.82, -0.12, 0.34),
            (0.76, -0.68, 0.18),
            (0.88, -1.32, 0.14),
            (0.80, -2.00, 0.06),
            (0.90, -2.62, 0.02),
            (0.84, -3.10, 0.00),
        ],
        [0.36, 0.48, 0.50, 0.44, 0.36, 0.26, 0.16, 0.10],
        [0.22, 0.28, 0.30, 0.26, 0.20, 0.14, 0.10, 0.06],
        nu=14,
        roll=-0.06,
    )
    return [curtain, left_face, right_face]


def main():
    head = find_head()
    remove_hair()
    hair_mat = bpy.data.materials.get("hair")
    if hair_mat is None:
        hair_mat = lib.material("hair", (0.210, 0.145, 0.125), 0.62)
    pieces = [build_crown(head)]
    pieces.extend(build_bang())
    pieces.extend(build_hang())
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
