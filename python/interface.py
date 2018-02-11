import threading
import random
import uuid

import numpy as np

import server
import window
from geometry import ViewerMessage, Mesh, Box, MeshBasicMaterial, SetObject, SetTransform, Points, PointsGeometry, PointsMaterial


if __name__ == '__main__':
    socket_port = 5500
    window.launch_thread(socket_port)
    manager = server.WebsocketManager(socket_port)

    with open("../head_multisense.obj", "r") as f:
        mesh_data = f.read()

    while True:
        path = "foo/bar"
        # if i == 0:
        #     path = "foo/bar"
        # else:
        #     path = input("path: ")
        verts = np.random.random((3, 100000)).astype(np.float32)
        msg = ViewerMessage([
            SetObject(
                Mesh(
                    Box([0.2, 0.1, 0.2]),
                    MeshBasicMaterial(0xff00ff)
                ),
                path.split("/") + ["box"]
            ),
            SetObject(
                Points(
                    PointsGeometry(verts, verts),
                    PointsMaterial()
                ),
                path.split("/") + ["points"]
            ),
            # SetTransform(
            #     [random.random() for i in range(3)],
            #     [0, 0, 0, 1],
            #     path.split("/")
            # )
        ])
        manager.send_to_all(msg.pack())
        # manager.send_to_all(umsgpack.packb(msg.serialize()))

        import time
        time.sleep(0.1)
