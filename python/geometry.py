import uuid

import umsgpack
import numpy as np


class Box:
    def __init__(self, lengths):
        self.lengths = lengths
        self.uuid = str(uuid.uuid1())

    def serialize(self):
        return {
            "uuid": self.uuid,
            "type": "BoxGeometry",
            "width": self.lengths[0],
            "height": self.lengths[1],
            "depth": self.lengths[2]
        }


class MeshBasicMaterial:
    def __init__(self, color):
        self.uuid = str(uuid.uuid1())
        self.color = color

    def serialize(self):
        return {
            "uuid": self.uuid,
            "type": "MeshBasicMaterial"
        }


class Mesh:
    def __init__(self, geometry, material):
        self.geometry = geometry
        self.material = material
        self.uuid = str(uuid.uuid1())

    def serialize(self):
        return {
            "metadata": {
                "version": 4.5,
                "type": "Object",
            },
            "geometries": [
                self.geometry.serialize()
            ],
            "materials": [
                self.material.serialize()
            ],
            "object": {
                "uuid": self.uuid,
                "type": "Mesh",
                "matrix": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                "geometry": self.geometry.uuid,
                "material": self.material.uuid
            }
        }


class SetObject:
    def __init__(self, object, path=[]):
        self.object = object
        self.path = path

    def serialize(self):
        return {
            "type": "set_object",
            "object": self.object.serialize(),
            "path": self.path
        }


class SetTransform:
    def __init__(self, position, quaternion, path=[]):
        self.position = position
        self.quaternion = quaternion
        self.path = path

    def serialize(self):
        return {
            "type": "set_transform",
            "path": self.path,
            "position": self.position,
            "quaternion": self.quaternion
        }


def item_size(array):
    if array.ndim == 1:
        return 1
    elif array.ndim == 2:
        return array.shape[0]
    else:
        raise ValueError("I can only pack 1- or 2-dimensional numpy arrays, but this one has {:d} dimensions".format(array.ndim))


def threejs_type(dtype):
    if dtype == np.uint8:
        return "Uint8Array", 0x12
    elif dtype == np.int32:
        return "Int32Array", 0x15
    elif dtype == np.uint32:
        return "Uint32Array", 0x16
    elif dtype == np.float32:
        return "Float32Array", 0x17
    else:
        raise ValueError("Unsupported datatype: " + str(dtype))


def pack_numpy_array(x):
    typename, extcode = threejs_type(x.dtype)
    return {
        "itemSize": item_size(x),
        "type": typename,
        "array": umsgpack.Ext(extcode, x.tobytes()),
        "normalized": False
    }


class PointsGeometry:
    def __init__(self, points, color=None):
        self.points = points
        self.color = color
        self.uuid = str(uuid.uuid1())

    def serialize(self):
        attrs = {"position": pack_numpy_array(self.points)}
        if self.color is not None:
            attrs["color"] = pack_numpy_array(self.color)
        return {
            "uuid": self.uuid,
            "type": "BufferGeometry",
            "data": {
                "attributes": attrs
            }
        }


class PointsMaterial:
    def __init__(self, size=0.001, color=0xffffff):
        self.size = size
        self.color = color
        self.uuid = str(uuid.uuid1())

    def serialize(self):
        return {
            "uuid": self.uuid,
            "type": "PointsMaterial",
            "color": self.color,
            "size": self.size,
            "vertexColors": 2
        }


class Points:
    def __init__(self, geometry, material):
        self.geometry = geometry
        self.material = material

    def serialize(self):
        return {
            "metadata": {"version": 4.5, "type": "Object"},
            "geometries": [self.geometry.serialize()],
            "materials": [self.material.serialize()],
            "object": {
                "type": "Points",
                "geometry": self.geometry.uuid,
                "material": self.material.uuid
            }
        }


class ViewerMessage:
    def __init__(self, commands):
        self.commands = commands

    def serialize(self):
        return {
            "commands": [c.serialize() for c in self.commands]
        }

    def pack(self):
        return umsgpack.packb(self.serialize())
