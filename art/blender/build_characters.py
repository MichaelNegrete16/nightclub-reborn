"""Chibi characters (male / female) with a character-creator friendly layout.

Run:  ~/tools/blender/blender -b --factory-startup -P build_characters.py -- <male|female> <out_dir>

Outputs <out_dir>/base_<sex>.glb, base_<sex>.blend and preview PNGs.

Conventions: Z-up, character faces -Y (glTF +Z forward), character's left = +X.
Both sexes share bone names/hierarchy so every animation works on both.
Every customizable thing is its own material (skin, hair, brow, iris, lips, top,
bottom, shoes, cap, glasses): the game tints them at runtime. Every swappable
piece (hair style, top, bottom, shoes, cap, glasses, face) is its own mesh object.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
SEX, OUT = ARGS[0], ARGS[1]
MODE = ARGS[2] if len(ARGS) > 2 else "full"
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

BONES = [
    "hips", "spine", "chest", "neck", "head",
    "upper_arm.L", "forearm.L", "hand.L", "upper_arm.R", "forearm.R", "hand.R",
    "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R",
]

# Body proportions (chibi). chest/waist/hip are (rx, ry) half-widths of the torso rings.
PARAMS = {
    "male": dict(sh_x=0.158, chest=(0.145, 0.098), waist=(0.118, 0.090), hip=(0.112, 0.088),
                 neck=0.052, arm_k=1.18, leg_x=0.058, leg_k=1.10, hand_k=1.12, bust=0.0,
                 lips=(0.40, 0.16, 0.14)),
    "female": dict(sh_x=0.112, chest=(0.098, 0.088), waist=(0.070, 0.072), hip=(0.118, 0.094),
                   neck=0.033, arm_k=0.78, leg_x=0.050, leg_k=0.94, hand_k=0.85, bust=0.016,
                   lips=(0.75, 0.15, 0.30)),
}
P = PARAMS[SEX]

# ---------------------------------------------------------------- materials
PALETTE = {
    "skin": (0.50, 0.28, 0.18),
    "hair": (0.03, 0.02, 0.02),
    "brow": (0.03, 0.02, 0.02),
    "iris": (0.08, 0.04, 0.02),
    "lips": P["lips"],
    "face": (0.02, 0.02, 0.04),
    "eye_white": (0.98, 0.98, 1.0),
    "top": (0.90, 0.10, 0.55),
    "bottom": (0.10, 0.12, 0.30),
    "shoes": (0.92, 0.92, 0.96),
    "cap": (0.70, 0.04, 0.04),
    "glasses": (0.02, 0.02, 0.03),
}


def make_material(name, rgb):
    mat = bpy.data.materials.new(f"mat_{name}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


MATS = {k: make_material(k, v) for k, v in PALETTE.items()}
MATS["hair"].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.40


def tint(name, rgb):
    MATS[name].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1.0)


# ----------------------------------------------------------------- builder
class Builder:
    """Accumulates tubes and ellipsoids into one bmesh with bone weights."""

    def __init__(self):
        self.bm = bmesh.new()
        self.dl = self.bm.verts.layers.deform.verify()

    def _weight(self, v, w):
        for bone, val in w.items():
            v[self.dl][BONES.index(bone)] = val

    def tube(self, rings, sides=8, caps=(True, True), ref=(0, 1, 0), mat=0):
        ref = Vector(ref)
        n = len(rings)
        verts = []
        for i, rg in enumerate(rings):
            c = Vector(rg["c"])
            a = Vector(rings[max(i - 1, 0)]["c"])
            b = Vector(rings[min(i + 1, n - 1)]["c"])
            t = (b - a).normalized()
            side = t.cross(ref)
            if side.length < 1e-5:
                side = t.cross(Vector((1, 0, 0)))
            side.normalize()
            up = side.cross(t).normalized()
            rx, ry = rg["r"] if isinstance(rg["r"], tuple) else (rg["r"], rg["r"])
            ring = []
            for k in range(sides):
                ang = 2 * math.pi * k / sides
                v = self.bm.verts.new(c + side * (math.cos(ang) * rx) + up * (math.sin(ang) * ry))
                self._weight(v, rg["w"])
                ring.append(v)
            verts.append(ring)
        for i in range(n - 1):
            for k in range(sides):
                k2 = (k + 1) % sides
                self.bm.faces.new((verts[i][k], verts[i][k2], verts[i + 1][k2], verts[i + 1][k]))
        if caps[0]:
            self.bm.faces.new(verts[0])
        if caps[1]:
            self.bm.faces.new(verts[-1])
        if mat:
            for ring in verts:
                for v in ring:
                    for f in v.link_faces:
                        f.material_index = mat

    def ellipsoid(self, center, radii, w, segs=(12, 8), mat=0):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
        for v in res["verts"]:
            v.co = Vector((v.co.x * radii[0] + center[0], v.co.y * radii[1] + center[1], v.co.z * radii[2] + center[2]))
            self._weight(v, w)
        if mat:
            for v in res["verts"]:
                for f in v.link_faces:
                    f.material_index = mat
        return res["verts"]

    def cut(self, predicate):
        faces = [f for f in self.bm.faces if predicate(f.calc_center_median())]
        bmesh.ops.delete(self.bm, geom=faces, context="FACES")

    def build(self, name, mats, parent_rig):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for p in me.polygons:
            p.use_smooth = True
        for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
            me.materials.append(m)
        obj = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(obj)
        for b in BONES:
            obj.vertex_groups.new(name=b)
        obj.parent = parent_rig
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = parent_rig
        return obj


# ----------------------------------------------------------------- armature
arm_data = bpy.data.armatures.new("RigData")
rig = bpy.data.objects.new("Rig", arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")

ARM_DIR = Vector((math.sin(math.radians(25)), 0, -math.cos(math.radians(25))))
SHOULDER_Z = 0.57
LEG_X = P["leg_x"]


def arm_points(sx):
    s = Vector((sx * P["sh_x"], 0, SHOULDER_Z))
    d = Vector((sx * ARM_DIR.x, 0, ARM_DIR.z))
    return {"S": s, "E": s + d * 0.12, "W": s + d * 0.24, "T": s + d * 0.29, "d": d}


def bone(name, head, tail, parent=None, connect=False):
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = Vector(head), Vector(tail)
    if parent:
        eb.parent = arm_data.edit_bones[parent]
        eb.use_connect = connect


bone("hips", (0, 0, 0.30), (0, 0, 0.36))
bone("spine", (0, 0, 0.36), (0, 0, 0.46), "hips", True)
bone("chest", (0, 0, 0.46), (0, 0, 0.60), "spine", True)
bone("neck", (0, 0, 0.60), (0, 0, 0.65), "chest", True)
bone("head", (0, 0, 0.65), (0, 0, 1.12), "neck", True)
for side, sx in (("L", 1), ("R", -1)):
    p = arm_points(sx)
    bone(f"upper_arm.{side}", p["S"], p["E"], "chest")
    bone(f"forearm.{side}", p["E"], p["W"], f"upper_arm.{side}", True)
    bone(f"hand.{side}", p["W"], p["T"], f"forearm.{side}", True)
    x = sx * LEG_X
    bone(f"thigh.{side}", (x, 0, 0.30), (x, 0, 0.17), "hips")
    bone(f"shin.{side}", (x, 0, 0.17), (x, 0, 0.065), f"thigh.{side}", True)
    bone(f"foot.{side}", (x, 0, 0.065), (x, -0.10, 0.03), f"shin.{side}", True)
bpy.ops.object.mode_set(mode="OBJECT")
REST = {b.name: b.matrix_local.to_3x3() for b in arm_data.bones}

# ------------------------------------------------------------------ geometry
HEAD_C = (0, 0, 0.86)
HEAD_R = (0.27, 0.25, 0.26)


def torso_rings(grow=0.0, z0=0.30, z1=0.63):
    hx, hy = P["hip"]
    wx, wy = P["waist"]
    cx, cy = P["chest"]
    nk = P["neck"] * 1.6
    pts = [
        (0.30, hx * 0.97, hy * 0.97, {"hips": 1}),
        (0.36, hx, hy, {"hips": 0.5, "spine": 0.5}),
        (0.46, wx, wy, {"spine": 1}),
        (0.53, cx * 0.92, cy + P["bust"], {"spine": 0.5, "chest": 0.5}),
        (0.58, cx, cy + P["bust"] * 0.5, {"chest": 1}),
        (0.63, nk, nk * 0.85, {"chest": 0.5, "neck": 0.5}),
    ]
    return [{"c": (0, 0, z), "r": (rx + grow, ry + grow), "w": w} for z, rx, ry, w in pts if z0 <= z <= z1]


def arm_rings(side, sx, grow=0.0, until=6):
    p = arm_points(sx)
    d = p["d"]
    s, e, w, t = p["S"], p["E"], p["W"], p["T"]
    U, F, H = f"upper_arm.{side}", f"forearm.{side}", f"hand.{side}"
    k = P["arm_k"]
    rings = [
        {"c": s, "r": 0.040 * k + grow, "w": {"chest": 0.5, U: 0.5}},
        {"c": s + d * 0.06, "r": 0.036 * k + grow, "w": {U: 1}},
        {"c": e, "r": 0.032 * k + grow, "w": {U: 0.5, F: 0.5}},
        {"c": e + d * 0.06, "r": 0.030 * k + grow, "w": {F: 1}},
        {"c": w, "r": 0.028 * k + grow, "w": {F: 0.5, H: 0.5}},
        {"c": t, "r": 0.026 * k + grow, "w": {H: 1}},
    ]
    return rings[:until]


def leg_rings(side, sx, grow=0.0, z_top=0.30):
    x = sx * LEG_X
    k = P["leg_k"]
    T, S, F = f"thigh.{side}", f"shin.{side}", f"foot.{side}"
    rings = [
        {"c": (x, 0, 0.30), "r": 0.052 * k + grow, "w": {T: 1}},
        {"c": (x, 0, 0.235), "r": 0.048 * k + grow, "w": {T: 1}},
        {"c": (x, 0, 0.17), "r": 0.042 * k + grow, "w": {T: 0.5, S: 0.5}},
        {"c": (x, 0, 0.115), "r": 0.038 * k + grow, "w": {S: 1}},
        {"c": (x, 0, 0.075), "r": 0.036 * k + grow, "w": {S: 0.5, F: 0.5}},
    ]
    return [r for r in rings if r["c"][2] <= z_top]


def foot_rings(side, sx, grow=0.0, toe_y=-0.085):
    x = sx * LEG_X
    F = f"foot.{side}"
    return [
        {"c": (x, 0.045, 0.050), "r": (0.058 + grow, 0.052 + grow), "w": {F: 1}},
        {"c": (x, -0.030, 0.050), "r": (0.066 + grow, 0.056 + grow), "w": {F: 1}},
        {"c": (x, toe_y, 0.040), "r": (0.060 + grow, 0.045 + grow), "w": {F: 1}},
    ]


HEAD = {"head": 1}
OBJECTS = {}

# --- skin: torso, neck, head, ears, arms + mitten hands, legs, feet
sk = Builder()
sk.tube(torso_rings())
sk.tube(
    [
        {"c": (0, 0, 0.62), "r": P["neck"], "w": {"neck": 1}},
        {"c": (0, 0, 0.70), "r": P["neck"], "w": {"neck": 0.5, "head": 0.5}},
    ],
    caps=(False, False),
)
sk.ellipsoid(HEAD_C, HEAD_R, HEAD, segs=(16, 10))
sk.ellipsoid((0, -0.243, 0.797), (0.018, 0.016, 0.016), HEAD, segs=(8, 6))
for sx in (1, -1):
    sk.ellipsoid((sx * 0.262, 0.0, 0.85), (0.03, 0.022, 0.045), HEAD, segs=(8, 6))
hk = P["hand_k"]
for side, sx in (("L", 1), ("R", -1)):
    p = arm_points(sx)
    sk.tube(arm_rings(side, sx))
    sk.ellipsoid(p["W"] + p["d"] * 0.045, (0.048 * hk, 0.044 * hk, 0.048 * hk), {f"hand.{side}": 1}, segs=(10, 7))
    sk.tube(leg_rings(side, sx))
    sk.tube(foot_rings(side, sx, grow=-0.014, toe_y=-0.075), ref=(0, 0, 1))
OBJECTS["skin"] = sk.build("body_skin", MATS["skin"], rig)


# --- hair styles (all share the head bone; the game picks one)
def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def hairline_a(a, front, side, back, f0=0.7, fw=0.7):
    """Rim height by angle from the front (0 = forehead, pi/2 = ears, pi = nape)."""
    z = front + (side - front) * smooth((a - f0) / fw)
    return z + (back - side) * smooth((a - 1.8) / 0.8)


def hair_surface(b, front=0.985, side=0.93, back=0.80, center=(0, 0.02, 0.885), radii=(0.288, 0.272, 0.278),
                 flare=0.0, taper=0.0, lip=0.012, n_phi=28, n_rows=10, hold=0.45, f0=0.7, fw=0.7, bump=0.0):
    """Hair as its own surface: apex -> rings down to a smooth, thick rim that follows `hairline_a`.
    `flare` pushes the hair outward below the head, `taper` rolls the rim inward, `lip` is the rim thickness."""
    cx, cy, cz = center
    rx, ry, rz = radii
    top = cz + rz
    rows = []
    rims = []
    for j in range(n_phi):
        phi = 2 * math.pi * j / n_phi
        ca, sa = math.cos(phi), math.sin(phi)
        a = abs(math.atan2(ca, -sa))
        zl = hairline_a(a, front, side, back, f0, fw)
        col = []
        for i in range(1, n_rows):
            u = i / (n_rows - 1)
            z = top - u * (top - zl)
            t = (z - cz) / rz
            s = math.sqrt(max(1 - min(abs(t), hold if t < 0 else 1.0) ** 2, 0.0))
            if t < 0:
                s *= 1 + flare * smooth((cz - z) / 0.4)
            s *= 1 + bump * math.sin(7 * phi) * math.sin(6 * u)
            w = z - zl
            if w < 0.07:
                s *= 1 - taper * (1 - w / 0.07) ** 2
            col.append(b.bm.verts.new(Vector((cx + rx * s * ca, cy + ry * s * sa, z))))
            b._weight(col[-1], HEAD)
        inner = b.bm.verts.new(Vector((cx + (rx * s - lip) * ca, cy + (ry * s - lip) * sa, zl + 0.004)))
        b._weight(inner, HEAD)
        rows.append(col)
        rims.append(inner)
    apex = b.bm.verts.new(Vector((cx, cy, top)))
    b._weight(apex, HEAD)
    for j in range(n_phi):
        k = (j + 1) % n_phi
        b.bm.faces.new((apex, rows[k][0], rows[j][0]))
        for i in range(n_rows - 2):
            b.bm.faces.new((rows[j][i], rows[k][i], rows[k][i + 1], rows[j][i + 1]))
        b.bm.faces.new((rows[j][-1], rows[k][-1], rims[k], rims[j]))


def lock(b, p0, p1, p2, r0, r1, n=6, sides=6):
    """Tapered strand along a quadratic curve."""
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
    rings = []
    for i in range(n):
        t = i / (n - 1)
        c = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2
        r = (r0 + (r1 - r0) * t) * (1 + 0.25 * math.sin(math.pi * t))
        rings.append({"c": tuple(c), "r": r, "w": HEAD})
    b.tube(rings, sides=sides)


def bangs(b, xs, z_end=0.955, r=0.052, jitter=None):
    for i, x in enumerate(xs):
        ze = z_end + (jitter[i] if jitter else 0.0)
        lock(b, (x * 0.5, -0.10, 1.12), (x * 1.0, -0.245, 1.07), (x * 1.04, -0.262, ze), r, r * 0.45, n=5)


def make_hair(name):
    b = Builder()
    if name == "crop_fringe":
        hair_surface(b, front=0.985, side=0.90, back=0.78, lip=0.010)
        bangs(b, (-0.17, -0.115, -0.058, 0.0, 0.058, 0.115, 0.17), z_end=0.965, r=0.058,
              jitter=(0.0, 0.020, -0.010, 0.025, 0.0, 0.020, -0.005))
    elif name == "side_part":
        hair_surface(b, front=0.99, side=0.90, back=0.80, lip=0.010)
        for k, (x0, w) in enumerate(((0.10, 0.095), (0.06, 0.090), (0.02, 0.080))):
            lock(b, (x0 * 0.6, -0.08, 1.02), (x0 * 0.2 - 0.02, -0.25 + 0.01 * k, 1.10),
                 (-0.17 - 0.015 * k, -0.25, 0.965 - 0.015 * k), w, 0.040, n=7, sides=7)
        lock(b, (0.13, -0.02, 1.12), (0.22, -0.18, 1.05), (0.27, -0.12, 0.93), 0.070, 0.040, n=5)
    elif name == "curtains":
        hair_surface(b, front=0.99, side=0.84, back=0.80, lip=0.010)
        for sx in (1, -1):
            lock(b, (sx * 0.05, -0.12, 1.03), (sx * 0.17, -0.23, 1.08), (sx * 0.245, -0.15, 0.90), 0.085, 0.040, n=6)
            lock(b, (sx * 0.07, -0.04, 1.03), (sx * 0.20, -0.15, 1.10), (sx * 0.275, -0.04, 0.88), 0.090, 0.045, n=6)
    elif name == "curly_top":
        hair_surface(b, front=0.995, side=0.90, back=0.82, lip=0.010)
        for th, cnt in ((0.0, 1), (0.40, 6), (0.75, 11), (1.05, 15), (1.30, 20)):
            for k in range(cnt):
                ph = 2 * math.pi * k / cnt + (0.3 if th > 0.5 else 0.0)
                if th > 1.2 and math.sin(ph) < -0.55:  # keep the forehead clear
                    continue
                pos = (
                    math.sin(th) * math.cos(ph) * 0.292,
                    0.02 + math.sin(th) * math.sin(ph) * 0.276,
                    0.885 + math.cos(th) * 0.282,
                )
                b.ellipsoid(pos, (0.068, 0.068, 0.064), HEAD, segs=(7, 5))
    elif name == "shaggy":
        hair_surface(b, front=0.985, side=0.76, back=0.66, flare=0.04, taper=0.14, lip=0.012, n_rows=12)
        bangs(b, (-0.17, -0.115, -0.058, 0.0, 0.058, 0.115, 0.17), z_end=0.95, r=0.058,
              jitter=(0.0, 0.030, -0.015, 0.020, -0.010, 0.030, 0.0))
        for sx in (1, -1):
            lock(b, (sx * 0.12, -0.10, 1.08), (sx * 0.27, -0.14, 0.92), (sx * 0.285, -0.04, 0.74), 0.070, 0.035, n=6)
    elif name == "afro":
        hair_surface(b, front=1.02, side=0.70, back=0.68, center=(0, 0.09, 0.95), radii=(0.320, 0.300, 0.300),
                     lip=0.020, n_phi=32, n_rows=12, hold=1.0, f0=0.5, fw=0.7)
        for th, cnt in ((0.0, 1), (0.45, 7), (0.90, 13), (1.35, 18), (1.80, 22), (2.15, 22)):
            for k in range(cnt):
                ph = 2 * math.pi * k / cnt + (0.25 if th > 0.5 else 0.0)
                pos = (
                    math.sin(th) * math.cos(ph) * 0.350,
                    0.09 + math.sin(th) * math.sin(ph) * 0.330,
                    0.95 + math.cos(th) * 0.330,
                )
                if pos[2] < 0.68 or (math.sin(ph) < -0.35 and pos[2] < 1.03):
                    continue
                b.ellipsoid(pos, (0.095, 0.095, 0.090), HEAD, segs=(7, 5))
    elif name == "long_layered":
        hair_surface(b, front=0.99, side=0.60, back=0.42, flare=0.12, taper=0.10, lip=0.014, n_rows=14)
        for sx in (1, -1):
            lock(b, (sx * 0.05, -0.14, 1.13), (sx * 0.20, -0.245, 0.99), (sx * 0.275, -0.12, 0.60), 0.065, 0.035, n=7)
            lock(b, (sx * 0.10, -0.12, 1.10), (sx * 0.24, -0.20, 0.95), (sx * 0.29, -0.02, 0.62), 0.060, 0.032, n=7)
    elif name == "bob_bangs":
        hair_surface(b, front=0.985, side=0.66, back=0.64, flare=0.06, taper=0.16, lip=0.014, n_rows=12)
        bangs(b, (-0.17, -0.085, 0.0, 0.085, 0.17))
    elif name == "high_ponytail":
        hair_surface(b, front=0.99, side=0.93, back=0.85, lip=0.010)
        for dx, k, rr in ((0.0, 1.0, 0.105), (-0.055, 0.85, 0.075), (0.055, 0.85, 0.075)):
            lock(b, (dx * 0.4, 0.04, 1.06), (dx * 1.2, 0.31, 1.34 * k), (dx * 1.6, 0.46, 0.86), rr, 0.035, n=9, sides=10)
        b.ellipsoid((0, 0.15, 1.17), (0.110, 0.085, 0.085), HEAD, segs=(10, 7))
        lock(b, (0.02, -0.10, 1.15), (-0.12, -0.24, 1.05), (-0.22, -0.18, 0.93), 0.075, 0.035, n=6)
        lock(b, (0.04, -0.06, 1.16), (0.15, -0.22, 1.06), (0.23, -0.14, 0.95), 0.060, 0.032, n=6)
    elif name == "space_buns":
        hair_surface(b, front=0.99, side=0.93, back=0.84, lip=0.010)
        bangs(b, (-0.15, -0.075, 0.0, 0.075, 0.15), z_end=0.96, r=0.048)
        for sx in (1, -1):
            b.ellipsoid((sx * 0.15, 0.04, 1.17), (0.105, 0.105, 0.100), HEAD, segs=(10, 7))
            lock(b, (sx * 0.20, -0.10, 1.00), (sx * 0.27, -0.12, 0.85), (sx * 0.25, -0.10, 0.70), 0.035, 0.020, n=5)
    return b.build(f"hair_{name}", MATS["hair"], rig)


HAIR_STYLES = [
    "crop_fringe", "side_part", "curtains", "curly_top", "shaggy", "afro",
    "long_layered", "bob_bangs", "high_ponytail", "space_buns",
]
HAIR_SHEET = {
    "male": ["crop_fringe", "side_part", "curtains", "curly_top", "shaggy", "afro"],
    "female": ["long_layered", "bob_bangs", "high_ponytail", "space_buns", "afro"],
}
OBJECTS["hair"] = {n: make_hair(n) for n in HAIR_STYLES}

# --- face: big eyes (white, iris, highlight), brows, smile; female adds lashes/eyelids
fc = Builder()
fem = SEX == "female"
for sx in (1, -1):
    fc.ellipsoid((sx * 0.095, -0.214, 0.840), (0.064, 0.032, 0.078), HEAD, segs=(10, 8), mat=1)
    fc.ellipsoid((sx * 0.097, -0.238, 0.835), (0.042, 0.016, 0.054), HEAD, segs=(10, 8), mat=2)
    fc.ellipsoid((sx * 0.085, -0.251, 0.860), (0.014, 0.007, 0.016), HEAD, segs=(6, 4), mat=1)
    if fem:
        fc.ellipsoid((sx * 0.095, -0.219, 0.945), (0.052, 0.015, 0.010), HEAD, segs=(8, 5), mat=3)
        fc.ellipsoid((sx * 0.152, -0.201, 0.888), (0.028, 0.012, 0.017), HEAD, segs=(6, 4), mat=0)
    else:
        fc.ellipsoid((sx * 0.095, -0.221, 0.935), (0.064, 0.020, 0.017), HEAD, segs=(8, 5), mat=3)
mouth_r = 0.017 if fem else 0.015
fc.tube(
    [
        {"c": (x, -0.216, 0.712 + 0.020 * (x / 0.050) ** 2), "r": (mouth_r, mouth_r * 0.75), "w": HEAD}
        for x in (-0.050, -0.0375, -0.025, -0.0125, 0.0, 0.0125, 0.025, 0.0375, 0.050)
    ],
    sides=6,
    ref=(0, 0, 1),
    mat=4,
)
OBJECTS["face"] = fc.build(
    "face_basic", [MATS["face"], MATS["eye_white"], MATS["iris"], MATS["brow"], MATS["lips"]], rig
)


# --- tops
def sleeves(builder, until, r0, r1, r2, upper_only=False):
    for side, sx in (("L", 1), ("R", -1)):
        p = arm_points(sx)
        d = p["d"]
        U, F, H = f"upper_arm.{side}", f"forearm.{side}", f"hand.{side}"
        rings = [
            {"c": p["S"] - d * 0.04, "r": r0, "w": {"chest": 0.7, U: 0.3}},
            {"c": p["S"] + d * 0.04, "r": r1, "w": {U: 1}},
            {"c": p["S"] + d * 0.09, "r": r2, "w": {U: 1}},
            {"c": p["E"], "r": r2 * 0.95, "w": {U: 0.5, F: 0.5}},
            {"c": p["E"] + d * 0.06, "r": r2 * 0.92, "w": {F: 1}},
            {"c": p["W"], "r": r2 * 0.88, "w": {F: 0.5, H: 0.5}},
        ]
        builder.tube(rings[:until], caps=(False, False))


tp = Builder()
tp.tube(torso_rings(grow=0.010, z0=0.36, z1=0.63), caps=(False, False))
sleeves(tp, 3, 0.055, 0.051, 0.048)
OBJECTS["top_tshirt"] = tp.build("top_tshirt", MATS["top"], rig)

hd = Builder()
hd.tube(torso_rings(grow=0.028, z0=0.30, z1=0.63), caps=(False, False))
sleeves(hd, 6, 0.064, 0.058, 0.054)
hd.ellipsoid((0, 0.075, 0.655), (0.115, 0.080, 0.070), {"chest": 0.5, "neck": 0.5}, segs=(10, 7))
OBJECTS["top_hoodie"] = hd.build("top_hoodie", MATS["top"], rig)

# --- bottoms
bt = Builder()
bt.tube(torso_rings(grow=0.012, z0=0.30, z1=0.36), caps=(False, False))
for side, sx in (("L", 1), ("R", -1)):
    bt.tube(leg_rings(side, sx, grow=0.010, z_top=0.30), caps=(False, False))
OBJECTS["bottom_jeans"] = bt.build("bottom_jeans", MATS["bottom"], rig)

if fem:
    sr = Builder()
    sr.tube(
        [
            {"c": (0, 0, 0.36), "r": (0.125, 0.100), "w": {"hips": 1}},
            {"c": (0, 0, 0.28), "r": (0.160, 0.130), "w": {"hips": 0.5, "thigh.L": 0.25, "thigh.R": 0.25}},
            {"c": (0, 0, 0.19), "r": (0.190, 0.160), "w": {"hips": 0.3, "thigh.L": 0.35, "thigh.R": 0.35}},
        ],
        sides=10,
        caps=(False, False),
    )
    OBJECTS["bottom_skirt"] = sr.build("bottom_skirt", MATS["bottom"], rig)

# --- shoes
sh = Builder()
for side, sx in (("L", 1), ("R", -1)):
    x = sx * LEG_X
    F = f"foot.{side}"
    sh.tube(foot_rings(side, sx, grow=0.010, toe_y=-0.115), ref=(0, 0, 1))
    sh.tube(
        [
            {"c": (x, 0.005, 0.105), "r": 0.050, "w": {F: 1}},
            {"c": (x, 0.015, 0.060), "r": 0.054, "w": {F: 1}},
        ],
        caps=(False, False),
    )
OBJECTS["shoes_sneakers"] = sh.build("shoes_sneakers", MATS["shoes"], rig)

# --- accessories
cp = Builder()
cp.ellipsoid((0, 0.0, 0.925), (0.288, 0.272, 0.258), HEAD, segs=(14, 8))
cp.cut(lambda c: c.z < 0.90)
cp.ellipsoid((0, -0.268, 0.915), (0.190, 0.140, 0.018), HEAD, segs=(10, 6))
OBJECTS["acc_cap"] = cp.build("acc_cap", MATS["cap"], rig)

gl = Builder()
for sx in (1, -1):
    gl.ellipsoid((sx * 0.095, -0.262, 0.845), (0.080, 0.010, 0.064), HEAD, segs=(10, 6))
    gl.ellipsoid((sx * 0.215, -0.190, 0.850), (0.012, 0.075, 0.010), HEAD, segs=(6, 4))
gl.ellipsoid((0, -0.258, 0.858), (0.026, 0.010, 0.010), HEAD, segs=(6, 4))
OBJECTS["acc_glasses"] = gl.build("acc_glasses", MATS["glasses"], rig)

if MODE == "full":
    # --------------------------------------------------------------- animation
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"

    X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)


    def fwd(a):
        return (X, -a)


    def side_up(side, a):
        return (Y, -a if side == "L" else a)


    def bend_elbow(a):
        return (X, -a)


    def knee(a):
        return (X, a)


    def twist(a):
        return (Z, a)


    def nod(a):
        return (X, a)


    def roll(a):
        return (Y, a)


    def apply_pose(spec):
        for pb in rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        for name, ops in spec.get("rot", {}).items():
            rw = Matrix.Identity(3)
            for axis, ang in ops:
                rw = Matrix.Rotation(ang, 3, axis) @ rw
            rest = REST[name]
            rig.pose.bones[name].rotation_quaternion = (rest.inverted() @ rw @ rest).to_quaternion()
        for name, v in spec.get("loc", {}).items():
            rig.pose.bones[name].location = REST[name].inverted() @ Vector(v)


    def key(frame):
        for pb in rig.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=frame, group=pb.name)
            pb.keyframe_insert("location", frame=frame, group=pb.name)


    def anim_idle(f, n):
        s = math.sin(2 * math.pi * f / n)
        return {
            "rot": {
                "chest": [nod(0.02 * s)],
                "head": [nod(-0.02 * s), roll(0.03 * math.cos(2 * math.pi * f / n))],
                "upper_arm.L": [fwd(0.05 * s)],
                "upper_arm.R": [fwd(-0.05 * s)],
            },
            "loc": {"hips": (0, 0, 0.004 * s)},
        }


    def anim_walk(f, n):
        p = 2 * math.pi * f / n
        rot = {
            "hips": [twist(0.08 * math.sin(p))],
            "spine": [twist(-0.12 * math.sin(p))],
            "head": [roll(0.06 * math.sin(p))],
            "thigh.L": [fwd(0.55 * math.sin(p))],
            "thigh.R": [fwd(-0.55 * math.sin(p))],
            "shin.L": [knee(0.8 * max(0, math.cos(p)))],
            "shin.R": [knee(0.8 * max(0, -math.cos(p)))],
            "upper_arm.L": [fwd(-0.55 * math.sin(p))],
            "upper_arm.R": [fwd(0.55 * math.sin(p))],
            "forearm.L": [bend_elbow(0.3 + 0.2 * max(0, math.sin(p)))],
            "forearm.R": [bend_elbow(0.3 + 0.2 * max(0, -math.sin(p)))],
        }
        return {"rot": rot, "loc": {"hips": (0, 0, 0.012 * math.cos(2 * p))}}


    def anim_dance(f, n):
        p = 2 * math.pi * f / n
        dip = 0.5 + 0.5 * math.cos(2 * p)
        pumpL = max(0, math.sin(p))
        pumpR = max(0, -math.sin(p))
        rot = {
            "hips": [roll(0.14 * math.sin(p)), twist(0.18 * math.sin(p))],
            "spine": [twist(0.2 * math.sin(p)), nod(0.08 * dip)],
            "head": [nod(0.22 * dip), roll(0.14 * math.sin(p))],
            "thigh.L": [fwd(0.4 * dip)],
            "thigh.R": [fwd(0.4 * dip)],
            "shin.L": [knee(0.8 * dip)],
            "shin.R": [knee(0.8 * dip)],
            "upper_arm.L": [side_up("L", 0.4 + 1.9 * pumpL), fwd(0.3 * pumpL)],
            "upper_arm.R": [side_up("R", 0.4 + 1.9 * pumpR), fwd(0.3 * pumpR)],
            "forearm.L": [bend_elbow(0.5 + 0.6 * pumpL)],
            "forearm.R": [bend_elbow(0.5 + 0.6 * pumpR)],
        }
        return {"rot": rot, "loc": {"hips": (0, 0, -0.04 * dip)}}


    def anim_celebrate(f, n):
        p = 2 * math.pi * f / n
        jump = max(0, math.sin(2 * p))
        wave = 0.85 + 0.15 * math.sin(4 * p)
        rot = {
            "head": [nod(-0.15)],
            "spine": [nod(-0.05 * jump)],
            "upper_arm.L": [side_up("L", 2.3 * wave)],
            "upper_arm.R": [side_up("R", 2.3 * wave)],
            "forearm.L": [bend_elbow(0.25)],
            "forearm.R": [bend_elbow(0.25)],
            "thigh.L": [fwd(0.5 * jump)],
            "thigh.R": [fwd(0.5 * jump)],
            "shin.L": [knee(0.9 * jump + 0.15)],
            "shin.R": [knee(0.9 * jump + 0.15)],
        }
        return {"rot": rot, "loc": {"hips": (0, 0, 0.14 * jump - 0.02)}}


    def anim_dj_mix(f, n):
        p = 2 * math.pi * f / n
        beat = 0.5 + 0.5 * math.cos(4 * p)
        scratch = math.sin(4 * p)
        rot = {
            "spine": [nod(0.14 + 0.03 * beat)],
            "head": [nod(0.10 + 0.18 * beat)],
            "upper_arm.R": [fwd(0.95 + 0.14 * scratch), side_up("R", 0.1)],
            "forearm.R": [bend_elbow(0.55 + 0.12 * scratch)],
            "upper_arm.L": [fwd(0.85), side_up("L", 0.15 + 0.12 * math.sin(p))],
            "forearm.L": [bend_elbow(0.6)],
            "thigh.L": [fwd(0.10 * beat)],
            "thigh.R": [fwd(0.10 * beat)],
            "shin.L": [knee(0.2 * beat)],
            "shin.R": [knee(0.2 * beat)],
        }
        return {"rot": rot, "loc": {"hips": (0, 0, -0.015 * beat)}}


    ANIMS = {
        "idle": (anim_idle, 48),
        "walk": (anim_walk, 24),
        "dance": (anim_dance, 24),
        "celebrate": (anim_celebrate, 36),
        "dj_mix": (anim_dj_mix, 48),
    }

    rig.animation_data_create()
    ACTIONS = {}
    for name, (fn, n) in ANIMS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        for f in range(n + 1):
            apply_pose(fn(f % n, n))
            key(f + 1)
        act.use_frame_range = True
        act.frame_start, act.frame_end = 1, n + 1
        ACTIONS[name] = act

    # ---------------------------------------------------------------- export
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"base_{SEX}.blend"))
    glb_path = os.path.join(OUT, f"base_{SEX}.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_skins=True,
        export_materials="EXPORT",
    )

# ---------------------------------------------------------------- preview
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 40
scene.cycles.use_denoising = False
scene.render.resolution_x, scene.render.resolution_y = 360, 520
scene.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.07, 0.16, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
scene.world = world

for loc, energy, color, rz in (
    ((3, -4, 5), 3.2, (1, 1, 1), 30),
    ((-4, -2, 2), 1.8, (1, 1, 1), -40),
    ((0, -5, 1.5), 1.3, (1, 1, 1), 0),
    ((-4, 4, 3), 2.5, (0.1, 0.9, 1.0), -140),
    ((4, 4, 3), 2.5, (1.0, 0.15, 0.7), 140),
):
    ld = bpy.data.lights.new("sun", "SUN")
    ld.energy, ld.color = energy, color
    lo = bpy.data.objects.new("sun", ld)
    bpy.context.collection.objects.link(lo)
    lo.location = loc
    lo.rotation_euler = (math.radians(55), 0, math.radians(rz))

try:
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    scene.render.line_thickness = 1.8
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    for old in list(vl.freestyle_settings.linesets):
        vl.freestyle_settings.linesets.remove(old)
    ls = vl.freestyle_settings.linesets.new("ink")
    ls.select_silhouette = ls.select_border = ls.select_crease = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink_style")
    ls.linestyle.color = (0.02, 0.02, 0.04)
    ls.linestyle.thickness = 1.8
except Exception as exc:  # noqa: BLE001
    print("FREESTYLE_SKIPPED", exc)

target = bpy.data.objects.new("target", None)
bpy.context.collection.objects.link(target)
target.location = (0, 0, 0.62)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 55
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
con = cam.constraints.new("TRACK_TO")
con.target, con.track_axis, con.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
scene.camera = cam

SKIN = {"light": (0.78, 0.50, 0.38), "tan": (0.50, 0.28, 0.18), "brown": (0.25, 0.12, 0.07), "dark": (0.10, 0.05, 0.03)}
HAIRC = {
    "black": (0.02, 0.015, 0.015), "brown": (0.12, 0.05, 0.02), "blonde": (0.75, 0.55, 0.15),
    "red": (0.55, 0.08, 0.05), "blue": (0.05, 0.20, 0.80), "pink": (0.80, 0.10, 0.40),
}
EYES = {"brown": (0.12, 0.05, 0.02), "blue": (0.05, 0.25, 0.80), "green": (0.05, 0.45, 0.15), "gray": (0.25, 0.28, 0.32)}

if SEX == "male":
    VARIANTS = [
        dict(skin="light", hair="crop_fringe", hc="black", eyes="brown", top=("top_tshirt", (0.9, 0.1, 0.55)), bottom=("bottom_jeans", (0.10, 0.12, 0.30)), anim=("idle", 1)),
        dict(skin="brown", hair="side_part", hc="black", eyes="brown", top=("top_tshirt", (0.05, 0.65, 0.90)), bottom=("bottom_jeans", (0.03, 0.03, 0.05)), glasses=True, anim=("dance", 4)),
        dict(skin="tan", hair="afro", hc="brown", eyes="green", top=("top_hoodie", (0.90, 0.65, 0.05)), bottom=("bottom_jeans", (0.45, 0.08, 0.08)), anim=("celebrate", 5)),
        dict(skin="dark", hair="curtains", hc="brown", eyes="blue", top=("top_tshirt", (0.95, 0.95, 0.98)), bottom=("bottom_jeans", (0.10, 0.12, 0.30)), anim=("walk", 4)),
    ]
else:
    VARIANTS = [
        dict(skin="light", hair="long_layered", hc="blonde", eyes="blue", top=("top_tshirt", (0.9, 0.1, 0.55)), bottom=("bottom_jeans", (0.10, 0.12, 0.30)), anim=("idle", 1)),
        dict(skin="brown", hair="space_buns", hc="black", eyes="brown", top=("top_tshirt", (0.05, 0.65, 0.90)), bottom=("bottom_skirt", (0.03, 0.03, 0.05)), anim=("dance", 4)),
        dict(skin="tan", hair="high_ponytail", hc="red", eyes="green", top=("top_hoodie", (0.45, 0.10, 0.85)), bottom=("bottom_jeans", (0.10, 0.12, 0.30)), anim=("celebrate", 5)),
        dict(skin="dark", hair="bob_bangs", hc="pink", eyes="brown", top=("top_tshirt", (0.90, 0.70, 0.05)), bottom=("bottom_skirt", (0.45, 0.08, 0.08)), glasses=True, anim=("walk", 4)),
    ]

TOPS = ["top_tshirt", "top_hoodie"]
BOTTOMS = [k for k in ("bottom_jeans", "bottom_skirt") if k in OBJECTS]


def lips_for(rgb):
    lum = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]
    return (0.80, 0.30, 0.36) if lum < 0.25 else (0.68, 0.20, 0.25)


def set_variant(v):
    tint("skin", SKIN[v["skin"]])
    tint("hair", HAIRC[v["hc"]])
    tint("brow", HAIRC[v["hc"]])
    tint("iris", EYES[v["eyes"]])
    tint("lips", lips_for(SKIN[v["skin"]]))
    for n, o in OBJECTS["hair"].items():
        o.hide_render = (n != v["hair"]) or v.get("cap", False)
    for t in TOPS:
        OBJECTS[t].hide_render = t != v["top"][0]
    tint("top", v["top"][1])
    for b in BOTTOMS:
        OBJECTS[b].hide_render = b != v["bottom"][0]
    tint("bottom", v["bottom"][1])
    OBJECTS["acc_cap"].hide_render = not v.get("cap", False)
    OBJECTS["acc_glasses"].hide_render = not v.get("glasses", False)


def shot(path, action, frame, angle_deg, elev_deg=12, dist=2.8, height=0.62):
    if action:
        rig.animation_data.action = ACTIONS[action]
    scene.frame_set(frame)
    target.location = (0, 0, height)
    a, e = math.radians(angle_deg), math.radians(elev_deg)
    cam.location = (math.sin(a) * dist * math.cos(e), -math.cos(a) * dist * math.cos(e), height + dist * math.sin(e))
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def stitch(paths, out):
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p)
        w, h = im.size
        imgs.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
        bpy.data.images.remove(im)
    row = np.concatenate(imgs, axis=1)
    o = bpy.data.images.new("lineup", row.shape[1], row.shape[0], alpha=False)
    o.pixels = row.ravel().tolist()
    o.filepath_raw = out
    o.file_format = "PNG"
    o.save()


def stack(rows, out):
    arr = []
    for paths in rows:
        imgs = []
        for p in paths:
            im = bpy.data.images.load(p)
            w, h = im.size
            imgs.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
            bpy.data.images.remove(im)
        arr.append(np.concatenate(imgs, axis=1))
    sheet = np.concatenate(arr[::-1], axis=0)  # image rows are bottom-up
    o = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=False)
    o.pixels = sheet.ravel().tolist()
    o.filepath_raw = out
    o.file_format = "PNG"
    o.save()


def hair_sheet():
    scene.render.resolution_x, scene.render.resolution_y = 260, 300
    tint("skin", SKIN["light"])
    tint("hair", (0.22, 0.09, 0.03))
    tint("brow", (0.22, 0.09, 0.03))
    for t in TOPS:
        OBJECTS[t].hide_render = t != "top_tshirt"
    for b in BOTTOMS:
        OBJECTS[b].hide_render = b != "bottom_jeans"
    OBJECTS["acc_cap"].hide_render = True
    OBJECTS["acc_glasses"].hide_render = True
    rows = []
    for style in HAIR_SHEET[SEX]:
        for n, o in OBJECTS["hair"].items():
            o.hide_render = n != style
        row = []
        for ang in (0, 55, 180):
            path = os.path.join(OUT, f"_h_{style}_{ang}.png")
            shot(path, None, 1, ang, elev_deg=8, dist=1.55, height=0.86)
            row.append(path)
        rows.append(row)
    stack(rows, os.path.join(OUT, f"hairsheet_{SEX}.png"))
    for r in rows:
        for p in r:
            os.remove(p)


if MODE == "full":
    tmp = []
    for i, v in enumerate(VARIANTS):
        set_variant(v)
        path = os.path.join(OUT, f"_v{i}.png")
        shot(path, v["anim"][0], v["anim"][1], 25 if i % 2 == 0 else -25, elev_deg=14)
        tmp.append(path)
    stitch(tmp, os.path.join(OUT, f"preview_{SEX}_lineup.png"))
    for p in tmp:
        os.remove(p)
    set_variant(VARIANTS[0])
    shot(os.path.join(OUT, f"preview_{SEX}_front.png"), "idle", 1, 0)
else:
    hair_sheet()
print("DONE", SEX, MODE)
