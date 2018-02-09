import asyncio
import webbrowser
import websockets
import os.path
import urllib.parse
import uuid

import umsgpack

async def new_window(port):
    msg_queue = asyncio.Queue()
    result_queue = asyncio.Queue()

    url = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "three.html")) + "?" + urllib.parse.urlencode({"host": "127.0.0.1", "port": port})
    print(url)
    # webbrowser.open(url, new=1)  # Broken on some Ubuntu versions: https://bugs.freedesktop.org/show_bug.cgi?id=45857

    connections = asyncio.Queue()

    async def handle(websocket, path):
        print("handling")
        # sockets.append(websocket)
        await connections.put(websocket)
        # while True:
        #     print("waiting for queue")
        #     msg = await msg_queue.get()
        #     print("sending msg")
        #     print(msg)
        #     await websocket.send(msg)
        #     result_queue.put(True)

    start_server = await websockets.serve(handle, 'localhost', port)
    # asyncio.get_event_loop().run_until_complete(start_server)
    print("start_server complete")

    return await connections.get()
    # return msg_queue, result_queue

# def send(msg):
#     print("putting", msg)
#     msg_queue.put(msg)

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


class AddObject:
    def __init__(self, object, path):
        self.object = object
        self.path = path

    def serialize(self):
        return {
            "type": "add_object",
            "object": self.object.serialize(),
            "path": self.path
        }


class ViewerMessage:
    def __init__(self, commands):
        self.commands = commands

    def serialize(self):
        return {
            "commands": [c.serialize() for c in self.commands]
        }


async def draw_box(connection):
    path = input("New path: ")
    msg = ViewerMessage([AddObject(
        Mesh(
            Box([0.2, 0.1, 0.2]),
            MeshBasicMaterial(0xff00ff)
        ),
        path.split("/")
    )])
    await connection.send(umsgpack.packb(msg.serialize()))

# connection = None

# async def get_connection():
#     sockets = await new_window(8900)
#     # global connection
#     connection = await sockets.get()
#     # asyncio.get_event_loop().stop()
#     return connection

# connection = asyncio.get_event_loop().run_until_complete(get_connection())
# asyncio.get_event_loop().run_forever()

connection = asyncio.get_event_loop().run_until_complete(new_window(8900))

print(connection)

def send_object(connection):
    # path = input("New path: ")
    path = "foo/bar"
    msg = ViewerMessage([AddObject(
        Mesh(
            Box([0.2, 0.1, 0.2]),
            MeshBasicMaterial(0xff00ff)
        ),
        path.split("/")
    )])
    asyncio.get_event_loop().run_until_complete(connection.send(umsgpack.packb(msg.serialize())))

send_object(connection)

# async def main():
#     sockets = await new_window(8900)
#     connection = await sockets.get()
#     print("connection", connection)
#     while True:
#         print("loop")
#         await draw_box(connection)

# main()


# asyncio.get_event_loop().run_until_complete(main())

# asyncio.get_event_loop().call_soon(draw_box)
# asyncio.get_event_loop().run_forever()

# async def hello(websocket, path):
#     name = await websocket.recv()
#     print("< {}".format(name))

#     greeting = "Hello {}!".format(name)
#     await websocket.send(greeting)
#     print("> {}".format(greeting))


# asyncio.get_event_loop().run_until_complete(start_server)
# asyncio.get_event_loop().run_forever()