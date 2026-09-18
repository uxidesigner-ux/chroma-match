"""
Shared helpers for building the figure in Blender.

Blender is here as a Python module (`pip install bpy`), so there is no window
and no mouse: every asset is scripted. What that buys over building meshes in
the browser is the modifier stack — above all subdivision surface, which is how
character artists actually get organic form. A coarse cage of a few hundred
faces subdivided twice gives a surface with real continuity; displacing a
dense sphere, which is what the browser version did, gives whatever the
displacement function happened to say at each vertex and reads as lumpy.
"""

import math
import bpy
import bmesh
from mathutils import Vector


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def mix(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def blob(distance: float, radius: float = 1.0) -> float:
    t = min(1.0, max(0.0, distance / radius))
    u = 1 - t * t
    return u * u * u


def shaded_smooth(obj) -> None:
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def subsurf(obj, levels: int = 2) -> None:
    modifier = obj.modifiers.new("subsurf", "SUBSURF")
    modifier.levels = levels
    modifier.render_levels = levels
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def relax(obj, factor: float = 0.5, repeat: int = 2) -> None:
    """Even the surface out. A cage built from a formula has uneven spacing and
    subdivision preserves it; a smoothing pass spreads it before the eye reads
    it as a ripple."""
    modifier = obj.modifiers.new("smooth", "SMOOTH")
    modifier.factor = factor
    modifier.iterations = repeat
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def sphere_cage(segments: int, rings: int, shape) -> "bpy.types.Object":
    """A low sphere whose vertices are moved by `shape`, ready to subdivide."""
    mesh = bpy.data.meshes.new("cage")
    obj = bpy.data.objects.new("cage", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    for vertex in bm.verts:
        direction = vertex.co.normalized()
        vertex.co = Vector(shape(direction))
    bm.to_mesh(mesh)
    bm.free()
    return obj


def ribbon(name: str, path, widths, thicks, resolution: int = 24):
    """
    A lock of hair: a curve with a rectangular bevel profile and a taper.

    Blender's own taper curve drives the section along the length, which is what
    gives a lock a point at the end. The browser version faked that by scaling a
    swept ellipse and the tip always ended as a flat cap.
    """
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    spline = curve.splines.new("NURBS")
    spline.points.add(len(path) - 1)
    for i, point in enumerate(path):
        spline.points[i].co = (point[0], point[1], point[2], 1.0)
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(path))

    profile = bpy.data.curves.new(name + "_profile", "CURVE")
    profile.dimensions = "2D"
    poly = profile.splines.new("POLY")
    corners = 16
    poly.points.add(corners - 1)
    for i in range(corners):
        a = (i / corners) * math.tau
        poly.points[i].co = (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.0, 1.0)
    poly.use_cyclic_u = True
    profile_obj = bpy.data.objects.new(name + "_profile", profile)
    bpy.context.scene.collection.objects.link(profile_obj)

    taper = bpy.data.curves.new(name + "_taper", "CURVE")
    taper.dimensions = "3D"
    tspline = taper.splines.new("NURBS")
    tspline.points.add(len(widths) - 1)
    for i, w in enumerate(widths):
        tspline.points[i].co = (i / (len(widths) - 1) * 2.0, w, 0.0, 1.0)
    tspline.use_endpoint_u = True
    taper_obj = bpy.data.objects.new(name + "_taper", taper)
    bpy.context.scene.collection.objects.link(taper_obj)

    curve.bevel_mode = "OBJECT"
    curve.bevel_object = profile_obj
    curve.taper_object = taper_obj
    curve.use_fill_caps = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.select_set(False)
    # The profile is a circle; squashing the mesh afterwards is what makes the
    # section a band rather than a cable, and it keeps the taper intact.
    for vertex in obj.data.vertices:
        vertex.co.y *= thicks
    bpy.data.objects.remove(profile_obj, do_unlink=True)
    bpy.data.objects.remove(taper_obj, do_unlink=True)
    return obj


def material(name: str, colour, roughness: float, metallic: float = 0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def assign(obj, mat) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def export(path: str) -> None:
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
    )
