class SetObject:
    def __init__(self, object, path=[]):
        self.object = object
        self.path = path

    def lower(self):
        return {
            "type": "set_object",
            "object": self.object.lower(),
            "path": self.path
        }


class SetTransform:
    def __init__(self, position, quaternion, path=[]):
        self.position = position
        self.quaternion = quaternion
        self.path = path

    def lower(self):
        return {
            "type": "set_transform",
            "path": self.path,
            "position": self.position,
            "quaternion": self.quaternion
        }



class ViewerMessage:
    def __init__(self, commands):
        self.commands = commands

    def lower(self):
        return {
            "commands": [c.lower() for c in self.commands]
        }

    # def pack(self):
    #     return umsgpack.packb(self.lower())

