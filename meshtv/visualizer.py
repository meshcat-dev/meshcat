import umsgpack
import numpy as np

from .servers.window import ViewerWindow
from .commands import ViewerMessage, SetObject, SetTransform, Delete


class CoreVisualizer:
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
        return self

    def url(self):
        return self.window.url()

    def send(self, commands):
        self.window.send(
            umsgpack.packb(ViewerMessage(commands).lower())
        )

    def close(self):
        self.window.close()


class Visualizer:
    __slots__ = ["core", "path"]

    def __init__(self, window=None, core=None, open=False):
        if core is not None:
            self.core = core
        else:
            self.core = CoreVisualizer(window=window, open=open)
        self.path = ["meshtv"]

    @staticmethod
    def view_into(core, path):
        vis = Visualizer(core=core)
        vis.path = path
        return vis

    def open(self):
        self.core.open()
        return self

    def url(self):
        return self.core.url()

    def jupyter_cell(self, height=500, width=800):
        from IPython.display import IFrame
        return IFrame(self.url(), height=height, width=width)

    def __getitem__(self, path):
        return Visualizer.view_into(self.core, self.path + path.split("/"))

    def set_object(self, object):
        return self.core.send([SetObject(object, self.path)])

    def set_transform(self, position=[0, 0, 0], quaternion=[0,0,0,1]):
        # three.js uses xyzw quaternion format
        return self.core.send([SetTransform(position, quaternion, self.path)])

    def delete(self):
        return self.core.send([Delete(self.path)])

    def close(self):
        self.core.close()


if __name__ == '__main__':
    import time
    import random

    from . import geometry as g

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






