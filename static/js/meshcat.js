'use strict';


class SceneNode {
    constructor(group, folder) {
        this.group = group;
        this.folder = folder;
        this.object = null;
        this.children = {};
        this.controllers = [];
        this.create_controls();
        for (let c of this.group.children) {
            this.add_child(c);
        }
    }

    add_child(group) {
        let f = this.folder.addFolder(group.name);
        let node = new SceneNode(group, f);
        this.children[group.name] = node;
        return node;
    }

    create_child(name) {
        let obj = new THREE.Group();
        obj.name = name;
        this.group.add(obj);
        return this.add_child(obj);
    }

    find(path) {
        if (path.length == 0) {
            return this;
        } else {
            let name = path[0];
            let child = this.children[name];
            if (child === undefined) {
                child = this.create_child(name);
            }
            return child.find(path.slice(1));
        }
    }

    create_controls() {
        for (let c of this.controllers) {
            c.remove();
        }
        this.vis_controller = new dat.controllers.BooleanController(this.group, "visible");
        this.folder.domElement.prepend(this.vis_controller.domElement);
        this.vis_controller.domElement.style.height = "0";
        this.vis_controller.domElement.style.float = "right";
        this.vis_controller.domElement.classList.add("visibility-checkbox");
        this.vis_controller.domElement.children[0].addEventListener("change", (evt) => {
            if (evt.target.checked) {
                this.folder.domElement.classList.remove("hidden-scene-element");
            } else {
                this.folder.domElement.classList.add("hidden-scene-element");
            }
        });
    }

    set_object(object) {
        if (this.object) {
            this.group.remove(this.object);
            dispose(this.object);
        }
        this.object = object;
        this.group.add(this.object);
        this.create_controls();
    }

    set_transform(matrix) {
        let mat = new THREE.Matrix4();
        mat.fromArray(matrix);
        mat.decompose(this.group.position, this.group.quaternion, this.group.scale);
    }

    dispose_recursive() {
        for (let name of Object.keys(this.children)) {
            this.children[name].dispose_recursive();
        }
        dispose(this.object);
        dispose(this.group);
    }

    delete(path) {
        if (path.length == 0) {
            console.error("Can't delete an empty path");
        } else {
            let parent = this.find(path.slice(0, path.length - 1));
            let name = path[path.length - 1];
            let child = parent.children[name];
            if (child !== undefined) {
                child.dispose_recursive();
                parent.group.remove(child.group);
                remove_folders(child.folder);
                parent.folder.removeFolder(child.folder);
                delete parent.children[name];
            }
        }
    }
}

// function material_gui(gui, material) {
//     gui.addColor(material, "color");
//     "reflectivity" in material && gui.add(material, "reflectivity");
//     "transparent" in material && gui.add(material, "transparent");
//     "opacity" in material && gui.add(material, "opacity", 0, 1, 0.01);
//     "emissive" in material && gui.addColor(material, "emissive");
// }

// function traverse_gui(folder, object) {
//     // TODO: This is kind of horrifying. Rather than fix the way
//     // dat.gui renders the visibility attribute, I just grab its
//     // dom element, then stick that element inside the title of
//     // the containing folder. I can then hide the original
//     // control. Finally, I add a hook that adds the
//     // hidden-scene-element class to the parent so that all
//     // nested visibility checkboxes will be disabled.
//     let v = folder.add(object, "visible");
//     v.domElement.classList.add("visibility-checkbox");
//     v.domElement.style.float = "right";
//     v.domElement.style.width = 0;
//     let parent = v.domElement.parentNode.parentNode;
//     parent.style.display = "none";
//     let title = parent.previousSibling;
//     title.appendChild(v.domElement);
//     v.domElement.children[0].addEventListener("change", function(evt) {
//         if (evt.target.checked) {
//             title.classList.remove("hidden-scene-element");
//         } else {
//             title.classList.add("hidden-scene-element");
//         }
//     });
//     if (object.children.length > 0) {
//         folder.open();
//         for (let child_object of object.children) {
//             let child_folder = folder.addFolder(child_object.name);
//             // child_folder.open();
//             traverse_gui(child_folder, child_object);
//         }
//     }
//     if (object.material !== undefined) {
//         let f = folder.addFolder("material");
//         material_gui(f, object.material);
//     }
// }

function remove_folders(gui) {
    for (let name of Object.keys(gui.__folders)) {
        let folder = gui.__folders[name];
        remove_folders(folder);
        dat.dom.dom.unbind(window, 'resize', folder.__resizeHandler);
        gui.removeFolder(folder);
    }
}

function set_transform(path, matrix) {
    scene_tree.find(path).set_transform(matrix);
}

function dispose(object) {
    if (!object) {
        return;
    }
    if (object.geometry) {
        object.geometry.dispose();
    }
    if (object.material) {
        if (object.material.map) {
            object.material.map.dispose();
        }
        object.material.dispose();
    }
}

function set_object(path, object) {
    scene_tree.find(path).set_object(object);
}

function delete_path(path) {
    if (path.length == 0) {
        console.error("Deleting the entire scene is not implemented")
    } else {
        scene_tree.delete(path);
    }
}

function handle_special_geometry(geom) {
    if (geom.type == "_meshfile") {
        if (geom.format == "obj") {
            let loader = new THREE.OBJLoader2();
            let obj = loader.parse("data:text/plain," + geom.data);
            let loaded_geom = obj.children[0].geometry;
            loaded_geom.uuid = geom.uuid;
            let json = loaded_geom.toJSON();
            for (let child of obj.children) {
                dispose(child);
            }
            return json;
        }
    }
    return geom;
}

function handle_set_object(path, object_data) {
    object_data.geometries = object_data.geometries.map(handle_special_geometry);
    let loader = new THREE.ObjectLoader();
    loader.parse(object_data, function (obj) {
        if (obj.geometry.type == "BufferGeometry") {
            obj.geometry.computeVertexNormals();
        }
        if (obj.name === "") {
            obj.name = "<object>";
        }
        set_object(path, obj);
    });
}

function handle_command(cmd) {
    let path = cmd.path.split("/").filter(x => x.length > 0);
    if (cmd.type == "set_property") {
        set_property(path, cmd.property, cmd.value);
    } else if (cmd.type == "set_transform") {
        set_transform(path, cmd.matrix);
    } else if (cmd.type == "delete") {
        delete_path(path);
    } else if (cmd.type == "set_object") {
        handle_set_object(path, cmd.object);
    }
}

function handle_command_message(message) {
	let data = msgpack.decode(new Uint8Array(message.data));
    handle_command(data);
};

function connect(url) {
    console.log(url);
    let connection = new WebSocket(url);
    connection.binaryType = "arraybuffer";
    connection.onmessage = handle_command_message;
    connection.onclose = function (evt) {
        // TODO: start trying to reconnect
    }
}

function set_3d_pane_size(w, h) {
    if (w === undefined) {
        w = threejs_pane.offsetWidth;
    }
    if (h === undefined) {
        h = window.innerHeight;
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

var camera = new THREE.PerspectiveCamera(75, 1, 0.01, 100);
var renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
var threejs_pane = document.querySelector("#threejs-pane");
threejs_pane.appendChild(renderer.domElement);
camera.position.set(3, 1, 0);
var controls = new THREE.OrbitControls(camera, threejs_pane);

function create_default_scene() {
    var scene = new THREE.Scene();
    scene.name = "Scene";
    scene.rotateX(-Math.PI / 2);
    var lights = new THREE.Group();
    lights.name = "Lights";
    scene.add(lights);

    var light = new THREE.DirectionalLight(0xffffff, 0.5);
    light.name = "DirectionalLight";
    light.position.set(1, 5, 10);
    lights.add(light);

    var ambient_light = new THREE.AmbientLight(0xffffff, 0.3);
    ambient_light.name = "AmbientLight";
    lights.add(ambient_light);

    var grid = new THREE.GridHelper(20, 40);
    grid.name = "Grid";
    grid.rotateX(Math.PI / 2);
    scene.add(grid);

    var axes = new THREE.AxesHelper(0.5);
    axes.name = "Axes";
    scene.add(axes);
    axes.visible = false;

    return scene;
}

var scene = create_default_scene();
var gui;
var scene_tree;

function create_scene_tree() {
    if (gui) {
        gui.destroy();
    }
    gui = new dat.GUI();
    let scene_folder = gui.addFolder("Scene");
    scene_folder.open();
    scene_tree = new SceneNode(scene, scene_folder);
}

create_scene_tree();
gui.close();


window.onload = function (evt) {
    set_3d_pane_size();
}
window.addEventListener('resize', evt => set_3d_pane_size(), false);

// https://stackoverflow.com/a/35251739
function download_file(name, contents, mime) {
    mime = mime || "text/plain";
    let blob = new Blob([contents], {type: mime});
    let link = document.createElement("a");
    document.body.appendChild(link);
    link.download = name;
    link.href = window.URL.createObjectURL(blob);
    link.onclick = function(e) {
        let scope = this;
        setTimeout(function() {
            window.URL.revokeObjectURL(scope.href);
        }, 1500);
    };
    link.click();
    link.remove();
}

function save_scene() {
    download_file("scene.json", JSON.stringify(scene.toJSON()));
}

function handle_load_file() {
    let file = this.files[0];
    if (!file) {
        return
    }
    let reader = new FileReader();
    reader.onload = function(e) {
        let contents = this.result;
        let json = JSON.parse(contents);
        let loader = new THREE.ObjectLoader();

        scene_tree.dispose_recursive();
        scene = loader.parse(json);
        create_scene_tree();
    };
    reader.readAsText(file);
}

// https://stackoverflow.com/a/26298948
function load_scene() {
    let input = document.createElement("input");
    input.type = "file";
    document.body.appendChild(input);
    input.addEventListener("change", handle_load_file, false);
    input.click();
    input.remove();
}

let url = `ws://${location.host}`;
connect(url);

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

