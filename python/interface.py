import threading
import random

import umsgpack

import geometry
import server
import window
from geometry import ViewerMessage, Mesh, Box, MeshBasicMaterial, SetObject, SetTransform


if __name__ == '__main__':
    socket_port = 5500
    window.launch_thread(socket_port)
    manager = server.WebsocketManager(socket_port)

    for i in range(100):
        path = "foo/bar"
        # if i == 0:
        #     path = "foo/bar"
        # else:
        #     path = input("path: ")
        msg = ViewerMessage([
            SetObject(
                Mesh(
                    Box([0.2, 0.1, 0.2]),
                    MeshBasicMaterial(0xff00ff)
                ),
                path.split("/")
            ),
            SetTransform(
                [random.random() for i in range(3)],
                [0, 0, 0, 1],
                path.split("/")
            )
        ])
        manager.send_to_all(umsgpack.packb(msg.serialize()))

        import time
        time.sleep(2)
