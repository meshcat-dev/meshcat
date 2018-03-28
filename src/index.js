var THREE = require('three');
var msgpack = require('msgpack-lite');
var dat = require('dat.gui').default; // TODO: why is .default needed?
require('imports-loader?THREE=three!./LoaderSupport.js');
require('imports-loader?THREE=three!./OBJLoader2.js');
require('imports-loader?THREE=three!./OrbitControls.js');

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
        this.vis_controller.domElement.classList.add("meshcat-visibility-checkbox");
        this.vis_controller.domElement.children[0].addEventListener("change", (evt) => {
            if (evt.target.checked) {
                this.folder.domElement.classList.remove("meshcat-hidden-scene-element");
            } else {
                this.folder.domElement.classList.add("meshcat-hidden-scene-element");
            }
        });
    }

    set_transform(matrix) {
        let mat = new THREE.Matrix4();
        mat.fromArray(matrix);
        mat.decompose(this.group.position, this.group.quaternion, this.group.scale);
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

function remove_folders(gui) {
    for (let name of Object.keys(gui.__folders)) {
        let folder = gui.__folders[name];
        remove_folders(folder);
        dat.dom.dom.unbind(window, 'resize', folder.__resizeHandler);
        gui.removeFolder(folder);
    }
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
    } else {
        return geom;
    }
}

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

function handle_load_file(viewer) {
    let file = this.files[0];
    if (!file) {
        return
    }
    let reader = new FileReader();
    reader.onload = function(e) {
        let contents = this.result;
        let json = JSON.parse(contents);
        let loader = new THREE.ObjectLoader();

        viewer.scene_tree.dispose_recursive();
        viewer.scene = loader.parse(json);
        viewer.create_scene_tree();
    };
    reader.readAsText(file);
}

class Viewer {
    constructor(dom_element) {
        this.dom_element = dom_element;
        this.camera = new THREE.PerspectiveCamera(75, 1, 0.01, 100);
        this.camera.position.set(3, 1, 0);
        this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        this.dom_element.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.background = "linear-gradient(to bottom,  lightskyblue 0%,midnightblue 100%)"
        this.controls = new THREE.OrbitControls(this.camera, this.dom_element);
        this.controls.enableKeys = false;
        this.scene = create_default_scene();

        this.create_scene_tree();
        this.gui.close();

        // TODO: probably shouldn't be directly accessing window?
        window.onload = (evt) => this.set_3d_pane_size();
        window.addEventListener('resize', (evt) => this.set_3d_pane_size(), false);

        requestAnimationFrame(() => this.set_3d_pane_size());
        this.animate();
    }

    create_scene_tree() {
        if (this.gui) {
            this.gui.destroy();
        }
        this.gui = new dat.GUI({autoPlace: false});
        this.dom_element.appendChild(this.gui.domElement);
        this.gui.domElement.style.position = "absolute";
        this.gui.domElement.style.right = 0;
        this.gui.domElement.style.top = 0;
        let scene_folder = this.gui.addFolder("Scene");
        scene_folder.open();
        this.scene_tree = new SceneNode(this.scene, scene_folder);
        this.scene_tree.folder.add(this, 'save_scene');
        this.scene_tree.folder.add(this, 'load_scene');
    }

    set_3d_pane_size(w, h) {
        if (w === undefined) {
            w = this.dom_element.offsetWidth;
        }
        if (h === undefined) {
            h = window.innerHeight;
        }
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    set_transform(path, matrix) {
        this.scene_tree.find(path).set_transform(matrix);
    }

    set_object(path, object) {
        this.scene_tree.find(path).set_object(object);
    }

    set_object_from_json(path, object_json) {
        object_json.geometries = object_json.geometries.map(handle_special_geometry);
        let loader = new THREE.ObjectLoader();
        loader.parse(object_json, (obj) => {
            if (obj.geometry.type == "BufferGeometry") {
                obj.geometry.computeVertexNormals();
            }
            if (obj.name === "") {
                obj.name = "<object>";
            }
            this.set_object(path, obj);
        });
    }

    delete_path(path) {
        if (path.length == 0) {
            console.error("Deleting the entire scene is not implemented")
        } else {
            this.scene_tree.delete(path);
        }
    }

    set_control(name, callback, value, min, max, step) {
        let handler = {};
        if (value !== undefined) {
            handler[name] = value;
            let controller = this.gui.add(handler, name, min, max, step);
            controller.onChange(eval(callback));
        } else {
            handler[name] = eval(callback);
            this.gui.add(handler, name);
        }
    }

    handle_command(cmd) {
        if (cmd.type == "set_transform") {
            let path = cmd.path.split("/").filter(x => x.length > 0);
            this.set_transform(path, cmd.matrix);
        } else if (cmd.type == "delete") {
            let path = cmd.path.split("/").filter(x => x.length > 0);
            this.delete_path(path);
        } else if (cmd.type == "set_object") {
            let path = cmd.path.split("/").filter(x => x.length > 0);
            this.set_object_from_json(path, cmd.object);
        } else if (cmd.type == "set_control") {
            this.set_control(cmd.name, cmd.callback, cmd.value, cmd.min, cmd.max, cmd.step);
        }
    }

    handle_command_message(message) {
        let data = msgpack.decode(new Uint8Array(message.data));
        this.handle_command(data);
    }

    connect(url) {
        if (url === undefined) {
            url = `ws://${location.host}`;
        }
        console.log(url);
        let connection = new WebSocket(url);
        connection.binaryType = "arraybuffer";
        connection.onmessage = (msg) => this.handle_command_message(msg);
        connection.onclose = function (evt) {
            // TODO: start trying to reconnect
        }
    }

    save_scene() {
        download_file("scene.json", JSON.stringify(this.scene.toJSON()));
    }

    // https://stackoverflow.com/a/26298948
    load_scene() {
        let input = document.createElement("input");
        input.type = "file";
        document.body.appendChild(input);
        let self = this;
        input.addEventListener("change", function() {handle_load_file(self)}, false);
        input.click();
        input.remove();
    }
}

// TODO: surely there's a better way to inject this style information
// than just appending it to the document here
let style = document.createElement("style");
style.appendChild(document.createTextNode(("")));
document.head.appendChild(style);
style.sheet.insertRule(`
    .meshcat-visibility-checkbox > input {
        float: right;
    }`);
style.sheet.insertRule(`
   .meshcat-hidden-scene-element li .meshcat-visibility-checkbox {
        opacity: 0.25;
        pointer-events: none;
    }`);
style.sheet.insertRule(`
    .meshcat-visibility-checkbox > input[type=checkbox] {
        height: 16px;
        width: 16px;
        display:inline-block;
        padding: 0 0 0 0px;
    }`);


module.exports = {
	Viewer: Viewer
};
