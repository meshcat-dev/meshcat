function build_gui(root_object) {
    let gui = new dat.GUI();
    let folder = gui.addFolder("Scene");
    folder.open();
    traverse_gui(folder, root_object);
    return gui;
}

function traverse_gui(folder, object) {
    folder.add(object, "visible");
    for (let child_object of object.children) {
        let child_folder = folder.addFolder(child_object.name);
        child_folder.open();
        traverse_gui(child_folder, child_object);
    }
}


function update_gui() {
    // gui.destroy();
    // gui = build_gui(scene);
}

function create_tree_viewer_root() {
    let viewer_tree = new THREE.Object3D();
    viewer_tree.name = "TreeViewer";
    viewer_tree.rotateX(-Math.PI / 2);
    scene.add(viewer_tree);
    return viewer_tree;
}

function find_child(path, root) {
    if (root === undefined) {
        root = viewer_tree;
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

function set_transform(path, position, quaternion) {
    let child = find_child(path);
    child.position.fromArray(position);
    child.quaternion.fromArray(quaternion);
}

function set_property(path, property, value) {
    let obj = find_child(path);
    obj[property] = value;
}

function set_object(path, object) {
    let parent = find_child(path);
    let child = parent.children.find(c => c.name == object.name);
    if (child !== undefined) {
        parent.remove(child);
        child.geometry.dispose();
        child.material.dispose();
    }
    parent.add(object);
    update_gui();
}

function delete_path(path) {
    let parent = find_child(path.slice(0, path.length));
    let child = parent.children.find(c => c.name == object.name);
    if (child !== undefined) {
        parent.remove(child);
        child.geometry.dispose();
        child.material.dispose();
        update_gui();
    }
}

function handle_command(cmd) {
    if (cmd.type == "set_property") {
        set_property(cmd.path, cmd.property, cmd.value);
    } else if (cmd.type == "set_transform") {
        set_transform(cmd.path, cmd.position, cmd.quaternion);
    } else if (cmd.type == "delete") {
        delete_path(path);
        if (path.length == 0) {
            viewer_tree = create_tree_viewer_root();
        }
    } else if (cmd.type == "set_object") {
        let loader = new THREE.ObjectLoader();
        loader.parse(cmd.object, function (obj) {
            obj.geometry.computeVertexNormals();
            set_object(cmd.path, obj);
        });
    }
}

function handle_command_message(message) {
	let data = msgpack.decode(new Uint8Array(message.data));
    for (let cmd of data.commands) {
        handle_command(cmd);
    }
};

let clients = {};

function handle_name_server_message(message) {
    let url = message;
    if (clients[url] !== undefined) {
        if (clients[url].readyState == 0 || clients[url].readyState == 1) {
            return;
        }
    }
    let connection = new WebSocket(url);
    clients[url] = connection;
    connection.binaryType = "arraybuffer";
    connection.onmessage = handle_command_message;
    connection.onclose = function (evt) {
        delete clients[url];
    }
}

let params = new URLSearchParams(location.search.slice(1));
let host = params.get('host') || "127.0.0.1";
let port = params.get('port') || "5005";
let url = `ws://${host}:${port}`;
console.log(url);
handle_name_server_message(url);

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


var scene = new THREE.Scene();
scene.name = "Scene";
var threejs_pane = document.querySelector("#threejs-pane");
var camera = new THREE.PerspectiveCamera(75, 1, 0.01, 100);
var renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
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

window.onload = function (evt) {
    set_3d_pane_size();
}
window.addEventListener('resize', evt => set_3d_pane_size(), false);
// set_3d_pane_size();

threejs_pane.appendChild(renderer.domElement);

var lights = new THREE.Group();
lights.name = "Lights";
scene.add(lights);

var light = new THREE.DirectionalLight(0xffffff, 0.5);
light.name = "DirectionalLight";
light.position.set(5, 5, 10);
lights.add(light);

var ambient_light = new THREE.AmbientLight(0xffffff, 0.3);
ambient_light.name = "AmbientLight";
lights.add(ambient_light);

var grid = new THREE.GridHelper(20, 40);
grid.name = "Grid";
scene.add(grid);

camera.position.set(3, 1, 0);
var controls = new THREE.OrbitControls(camera, threejs_pane);

var viewer_tree = create_tree_viewer_root();
var axes = new THREE.AxesHelper(0.5);
axes.name = "Axes";
viewer_tree.add(axes);
// var gui = build_gui(scene);



function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();