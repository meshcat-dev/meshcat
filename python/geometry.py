import uuid
import umsgpack


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


class ViewerMessage:
    def __init__(self, commands):
        self.commands = commands

    def serialize(self):
        return {
            "commands": [c.serialize() for c in self.commands]
        }


