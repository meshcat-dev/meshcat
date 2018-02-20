'use strict';

var gui;

function build_gui(root_object) {
    if (gui !== undefined) {
        remove_folders(gui);
    } else {
        gui = new dat.GUI();
    }
    let folder = gui.addFolder("Scene");
    folder.open();
    traverse_gui(folder, root_object);
    return gui;
}

function material_gui(gui, material) {
    gui.addColor(material, "color");
    "reflectivity" in material && gui.add(material, "reflectivity");
    "transparent" in material && gui.add(material, "transparent");
    "opacity" in material && gui.add(material, "opacity", 0, 1, 0.01);
    "emissive" in material && gui.addColor(material, "emissive");
}

function traverse_gui(folder, object) {
    // TODO: This is kind of horrifying. Rather than fix the way
    // dat.gui renders the visibility attribute, I just grab its
    // dom element, then stick that element inside the title of
    // the containing folder. I can then hide the original
    // control. Finally, I add a hook that adds the
    // hidden-scene-element class to the parent so that all
    // nested visibility checkboxes will be disabled.
    let v = folder.add(object, "visible");
    v.domElement.classList.add("visibility-checkbox");
    v.domElement.style.float = "right";
    v.domElement.style.width = 0;
    let parent = v.domElement.parentNode.parentNode;
    parent.style.display = "none";
    let title = parent.previousSibling;
    title.appendChild(v.domElement);
    v.domElement.children[0].addEventListener("change", function(evt) {
        if (evt.target.checked) {
            title.classList.remove("hidden-scene-element");
        } else {
            title.classList.add("hidden-scene-element");
        }
    });
    if (object.children.length > 0) {
        folder.open();
        for (let child_object of object.children) {
            let child_folder = folder.addFolder(child_object.name);
            // child_folder.open();
            traverse_gui(child_folder, child_object);
        }
    }
    if (object.material !== undefined) {
        let f = folder.addFolder("material");
        material_gui(f, object.material);
    }
}

function remove_folders(gui) {
    for (let name of Object.keys(gui.__folders)) {
        let folder = gui.__folders[name];
        remove_folders(folder);
        dat.dom.dom.unbind(window, 'resize', folder.__resizeHandler);
        gui.removeFolder(folder);
    }
}

function update_gui() {
    build_gui(scene);
    // let root = document.getElementById("scene-controls");
    // while (root.lastChild) {
    //     root.removeChild(root.lastChild);
    // }
    // create_options(scene, root);
}

// function create_options(node, element) {
//     let container = create_element("div", element, {class: "scene-tree-item"});
//     let row = create_element("div", container, {class: "scene-tree-header"});
//     let expander = create_element("div", row, {class: "expansion-control"});
//     if (node.children.length) {
//         expander.addEventListener("click", function() {
//             container.classList.toggle("expanded");
//             container.classList.toggle("collapsed");
//         });
//         container.classList.add("expanded");
//     }
//     let name = create_text(node.name || "<anonymous>", create_element("div", row, {class: "scene-tree-label"}));
//     let visibility = create_element("div", row, {class: "scene-tree-visibility"});
//     create_text("👁", visibility);
//     if (!node.visible) {
//         container.classList.add("hidden");
//     }
//     visibility.addEventListener("click", function() {
//         container.classList.toggle("hidden");
//         node.visible = !container.classList.contains("hidden");
//     });
//     let children = create_element("div", container, {class: "scene-tree-children"})
//     if ("children" in node) {
//         for (let child of node.children) {
//             create_options(child, children);
//         }
//     }
// }


function find_child(path, root) {
    if (root === undefined) {
        root = scene;
    }
    if (path.length > 0) {
        let child = root.children.find(c => c.name == path[0]);
        if (child === undefined) {
            child = new THREE.Object3D();
            child.name = path[0];
            root.add(child);
        }
        return find_child(path.slice(1, path.length + 1), child);
    } else {
        return root;
    }
}

function set_transform(path, matrix) {
    let child = find_child(path);
    let mat = new THREE.Matrix4();
    mat.fromArray(matrix);
    mat.decompose(child.position, child.quaternion, child.scale);
}

function set_property(path, property, value) {
    let obj = find_child(path);
    obj[property] = value;
}

function dispose(object) {
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

function dispose_recursive(object) {
    dispose(object);
    for (let child of object.children) {
        dispose_recursive(child);
    }
}

function set_object(path, object) {
    let parent = find_child(path);
    let child = parent.children.find(c => c.name == object.name);
    if (child !== undefined) {
        parent.remove(child);
        dispose(child);
    }
    parent.add(object);
    update_gui();
    update_embed();
}

function delete_path(path) {
    let parent = find_child(path.slice(0, path.length - 1));
    let child = parent.children.find(c => c.name == path[path.length - 1]);
    if (child !== undefined) {
        parent.remove(child);
        dispose_recursive(child);
        update_gui();
        update_embed();
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
    if (cmd.type == "set_property") {
        set_property(cmd.path, cmd.property, cmd.value);
    } else if (cmd.type == "set_transform") {
        set_transform(cmd.path, cmd.matrix);
    } else if (cmd.type == "delete") {
        delete_path(cmd.path);
    } else if (cmd.type == "set_object") {
        handle_set_object(cmd.path, cmd.object);
    }
}

function handle_command_message(message) {
	let data = msgpack.decode(new Uint8Array(message.data));
    for (let cmd of data.commands) {
        handle_command(cmd);
    }
};

let websocket_server_connections = {};

function handle_name_server_message(message) {
    let url = message;
    let existing_connection = websocket_server_connections[url];
    if (existing_connection !== undefined) {
        if (existing_connection.readyState == 0 || existing_connection.readyState == 1) {
            return;
        }
    }
    let connection = new WebSocket(url);
    websocket_server_connections[url] = connection;
    connection.binaryType = "arraybuffer";
    connection.onmessage = handle_command_message;
    connection.onclose = function (evt) {
        delete websocket_server_connections[url];
    }
}

function connect(host, port) {
    let url = `ws://${host}:${port}`;
    console.log(url);
    handle_name_server_message(url);
}

function listen_for_client() {
    var request = new XMLHttpRequest();
    request.onreadystatechange = function() {
        if (request.readyState == 4) {
            if (request.status == 200) {
                handle_name_server_message(request.response);
            }
            setTimeout(listen_for_client, 1000);
        }
    }
    request.open("GET", "http://127.0.0.1:8765", true);
    request.timeout = 1000;
    try {
        request.send();
    } catch(error) {
    }
}
// listen_for_client();

function set_3d_pane_size(w, h) {
    if (w === undefined) {
        // w = window.innerWidth;
        w = threejs_pane.offsetWidth;
    }
    if (h === undefined) {
        h = window.innerHeight;
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}


// function create_tree_viewer_root() {
//     let viewer_tree = new THREE.Object3D();
//     viewer_tree.name = "TreeViewer";
//     viewer_tree.rotateX(-Math.PI / 2);
//     scene.add(viewer_tree);
//     return viewer_tree;
// }

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

    return scene;
}

var scene = create_default_scene();

window.onload = function (evt) {
    set_3d_pane_size();
}
window.addEventListener('resize', evt => set_3d_pane_size(), false);


function create_element(type, parent, attrs) {
    let element = document.createElement(type);
    if (attrs !== undefined) {
        for (let attr of Object.keys(attrs)) {
            element.setAttribute(attr, attrs[attr]);
        }
    }
    if (parent !== undefined && parent !== null) {
        parent.append(element);
    }
    return element;
}

function create_text(text, parent) {
    let element = document.createTextNode(text);
    if (parent !== undefined) {
        parent.append(element);
    }
    return element;
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
        scene = loader.parse(json);
        update_gui();
        update_embed();
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

// create_options(scene, document.getElementById("scene-controls"));
update_gui();

let params = new URLSearchParams(location.search.slice(1));
let host = params.get("host");
let port = params.get("port");
if (host !== null && port !== null) {
    connect(host, port);
}

var embed_pending = false;
var embed_enabled = false;

function embed() {
    embed_pending = false;
    let script = document.getElementById("embedded-json");
    script.text = `scene = new THREE.ObjectLoader().parse(JSON.parse(\`${JSON.stringify(scene.toJSON())}\`)); update_gui();`;
}

function update_embed() {
    if (embed_pending || !embed_enabled) {
        return;
    }
    setTimeout(embed, 1000);
}


function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

