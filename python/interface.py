import threading
import random
import uuid

import numpy as np

import server
import window
import geometry as g


if __name__ == '__main__':
    socket_port = 5500
    window.launch_local(socket_port)
    manager = server.WebsocketManager(socket_port)

    with open("../head_multisense.obj", "r") as f:
        mesh_data = f.read()

    while True:
        verts = np.random.random((3, 100000)).astype(np.float32)
        msg = g.ViewerMessage([
            g.SetObject(
                g.Mesh(
                    g.Box([0.2, 0.1, 0.2]),
                    g.MeshLambertMaterial(0xffffff)
                ),
                ["primitives", "box"]
            ),
            g.SetObject(
                g.Mesh(
                    g.Box([0.2, 0.1, 0.2]),
                    g.MeshLambertMaterial(color=0xffffff)
                ),
                []
            ),
            g.SetObject(
                g.Points(
                    g.PointsGeometry(verts, verts),
                    g.PointsMaterial()
                ),
                ["primitives", "points"]
            ),
            g.SetTransform(
                [random.random() for i in range(3)],
                [0, 0, 0, 1],
                ["primitives"]
            ),
            g.SetObject(
                g.Mesh(
                    g.ObjMeshGeometry.from_file("../head_multisense.obj"),
                    g.MeshLambertMaterial(
                        map=g.ImageTexture(
                            image=g.PngImage.from_file("../HeadTextureMultisense.png")
                        )
                    )
                ),
                ["robots", "valkryie", "head"]
            ),
            g.SetTransform(
                [0, 0, 1],
                [0, 0, 0, 1],
                ["robots", "valkryie", "head"]
            )

        ])
        manager.send_to_all(msg.pack())
        # manager.send_to_all(umsgpack.packb(msg.serialize()))

        # break
        import time
        time.sleep(1)
