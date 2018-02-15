import umsgpack
import numpy as np

from .servers.window import ViewerWindow
from .commands import ViewerMessage


class Visualizer:
    def __init__(self, window=None, open=False):
        if window is None:
            window = ViewerWindow()
        self.window = window
        if open:
            self.window.open()
        else:
            print("You can open the visualizer by visiting the following URL:")
            print(self.window.url())

    def open(self):
        self.window.open()

    def send(self, commands):
        self.window.send(
            umsgpack.packb(ViewerMessage(commands).lower())
        )

    def jupyter_cell(self, height=500, width=800):
        from IPython.display import IFrame
        return IFrame(self.window.url(), height=height, width=width)


if __name__ == '__main__':
    import time
    import random

    from . import geometry as g
    from .commands import SetObject, SetTransform

    vis = Visualizer().open()

    with open("../head_multisense.obj", "r") as f:
        mesh_data = f.read()

    while True:
        verts = np.random.random((3, 100000)).astype(np.float32)
        vis.send([
            SetObject(
                g.Mesh(
                    g.Box([0.2, 0.1, 0.2]),
                    g.MeshLambertMaterial(0xffffff)
                ),
                ["primitives", "box"]
            ),
            SetObject(
                g.Mesh(
                    g.Box([0.2, 0.1, 0.2]),
                    g.MeshLambertMaterial(color=0xffffff)
                ),
                []
            ),
            SetObject(
                g.Points(
                    g.PointsGeometry(verts, color=verts),
                    g.PointsMaterial()
                ),
                ["primitives", "points"]
            ),
            SetTransform(
                [random.random() for i in range(3)],
                [0, 0, 0, 1],
                ["primitives"]
            ),
            SetObject(
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
            SetTransform(
                [0, 0, 1],
                [0, 0, 0, 1],
                ["robots", "valkryie", "head"]
            )

        ])
        time.sleep(1)






