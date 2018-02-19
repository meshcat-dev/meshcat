import math
import time
import meshtv

vis = meshtv.Visualizer().open()
box = meshtv.geometry.Box([0.5, 0.5, 0.5])
vis.set_object(box)

for i in range(200):
    theta = i / 100 * 2 * math.pi
    vis.set_transform([0, 0, 0], [0, 0, math.sin(theta/2), math.cos(theta/2)])
    time.sleep(0.01)

vis.close()
