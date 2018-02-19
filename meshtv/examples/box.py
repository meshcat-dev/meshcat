import meshtv

vis = meshtv.Visualizer().open()
box = meshtv.geometry.Box([0.5, 0.5, 0.5])
vis.set_object(box)
import time
time.sleep(1)