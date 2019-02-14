var THREE = require('three');
var msgpack = require('msgpack-lite');
var dat = require('dat.gui').default; // TODO: why is .default needed?
require('imports-loader?THREE=three!./LoaderSupport.js');
require('imports-loader?THREE=three!./OBJLoader2.js');
require('imports-loader?THREE=three!./ColladaLoader.js');
require('imports-loader?THREE=three!./STLLoader.js');
require('imports-loader?THREE=three!./OrbitControls.js');
require('ccapture.js');

class SceneNode {
    constructor(object, folder, on_update) {
        this.object = object;
        this.folder = folder;
        this.children = {};
        this.controllers = [];
        this.on_update = on_update;
        this.create_controls();
        for (let c of this.object.children) {
            this.add_child(c);
        }
    }

    add_child(object) {
        let f = this.folder.addFolder(object.name);
        let node = new SceneNode(object, f, this.on_update);
        this.children[object.name] = node;
        return node;
    }

    create_child(name) {
        let obj = new THREE.Group();
        obj.name = name;
        this.object.add(obj);
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
            this.folder.remove(c);
        }
        if (this.vis_controller !== undefined) {
            this.folder.domElement.removeChild(this.vis_controller.domElement);
        }
        this.vis_controller = new dat.controllers.BooleanController(this.object, "visible");
        this.vis_controller.onChange(() => this.on_update());
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
        if (this.object.isLight) {
            let intensity_controller = this.folder.add(this.object, "intensity").min(0).step(0.01);
            intensity_controller.onChange(() => this.on_update());
            this.controllers.push(intensity_controller);
            if (this.object.castShadow !== undefined){
                let cast_shadow_controller = this.folder.add(this.object, "castShadow");
                cast_shadow_controller.onChange(() => this.on_update());
                this.controllers.push(cast_shadow_controller);
            }
        }
        if (this.object.isCamera) {
            let controller = this.folder.add(this.object, "zoom").min(0).step(0.1);
            controller.onChange(() => {
                // this.object.updateProjectionMatrix();
                this.on_update()
            });
            this.controllers.push(controller);
        }
    }

    set_property(property, value) {
        if (property === "position") {
            this.object.position.set(value[0], value[1], value[2]);
        } else if (property === "quaternion") {
            this.object.quaternion.set(value[0], value[1], value[2], value[3]);
        } else if (property === "scale") {
            this.object.scale.set(value[0], value[1], value[2]);
        } else {
            this.object[property] = value;
        }
        this.vis_controller.updateDisplay();
        this.controllers.forEach(c => c.updateDisplay());
    }

    set_transform(matrix) {
        let mat = new THREE.Matrix4();
        mat.fromArray(matrix);
        mat.decompose(this.object.position, this.object.quaternion, this.object.scale);
    }

    set_object(object) {
        let parent = this.object.parent;
        this.dispose_recursive();
        this.object.parent.remove(this.object);
        this.object = object;
        parent.add(object);
        this.create_controls();
    }

    dispose_recursive() {
        for (let name of Object.keys(this.children)) {
            this.children[name].dispose_recursive();
        }
        dispose(this.object);
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
                parent.object.remove(child.object);
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
    return scene;
}


function handle_special_geometry(geom) {
    if (geom.type == "_meshfile") {
        if (geom.format == "obj") {
            let loader = new THREE.OBJLoader2();
            let obj = loader.parse(geom.data + "\n");
            let loaded_geom = obj.children[0].geometry;
            loaded_geom.uuid = geom.uuid;
            let json = loaded_geom.toJSON();
            for (let child of obj.children) {
                dispose(child);
            }
            return json;
        } else if (geom.format == "dae") {
            let loader = new THREE.ColladaLoader();
            let obj = loader.parse(geom.data);

            let loaded_geom = obj.scene.children[0].geometry;
            loaded_geom.uuid = geom.uuid;
            let json = loaded_geom.toJSON();
            return json;
        } else if (geom.format == "stl") {
            let loader = new THREE.STLLoader();
            let loaded_geom = loader.parse(geom.data.buffer);

            loaded_geom.uuid = geom.uuid;
            let json = loaded_geom.toJSON();
            return json;
        } else {
            console.error("Unsupported mesh type:", geom);
        }
    } else {
        return geom;
    }
}


// https://stackoverflow.com/a/15832662
function download_data_uri(name, uri) {
  let link = document.createElement("a");
  link.download = name;
  link.href = uri;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

class Animator {
    constructor(viewer) {
        this.viewer = viewer;
        this.folder = this.viewer.gui.addFolder("Animations");
        this.mixer = new THREE.AnimationMixer();
        this.loader = new THREE.ObjectLoader();
        this.clock = new THREE.Clock();
        this.actions = [];
        this.playing = false;
        this.setup_capturer("png");
    }

    setup_capturer(format) {
        this.capturer = new CCapture({
            format: format,
            name: "meshcat_" + String(Date.now())
        });
        this.capturer.format = format;
    }

    play() {
        this.clock.start();
        // this.mixer.timeScale = 1;
        for (let action of this.actions) {
            action.play();
        }
        this.playing = true;
    }

    record() {
        this.reset();
        this.play();
        this.recording = true;
        this.capturer.start();
    }

    pause() {
        // this.mixer.timeScale = 0;
        this.clock.stop();
        this.playing = false;

        if (this.recording) {
            this.stop_capture();
            this.save_capture();
        }
    }

    stop_capture() {
        this.recording = false;
        this.capturer.stop();
        this.viewer.animate(); // restore the animation loop which gets disabled by capturer.stop()
    }

    save_capture() {
        this.capturer.save();
        if (this.capturer.format === "png") {
            alert("To convert the still frames into a video, extract the `.tar` file and run: \nffmpeg -r 60 -i %07d.png \\\n\t -vcodec libx264 \\\n\t -preset slow \\\n\t -crf 18 \\\n\t output.mp4");
        } else if (this.capturer.format === "jpg") {
            alert("To convert the still frames into a video, extract the `.tar` file and run: \nffmpeg -r 60 -i %07d.jpg \\\n\t -vcodec libx264 \\\n\t -preset slow \\\n\t -crf 18 \\\n\t output.mp4");
        }
    }

    reset() {
        for (let action of this.actions) {
            action.reset();
        }
        this.mixer.update(0);
        this.setup_capturer(this.capturer.format);
        this.viewer.set_dirty();
    }

    clear() {
        remove_folders(this.folder);
        this.mixer.stopAllAction();
        this.actions = [];
        this.mixer = new THREE.AnimationMixer();
    }

    load(animations, options) {
        this.clear();

        this.folder.open();
        let folder = this.folder.addFolder("default");
        folder.open();
        folder.add(this, "play");
        folder.add(this, "pause");
        folder.add(this, "reset");
        folder.add(this.mixer, "timeScale").step(0.01).min(0);
        let recording_folder = folder.addFolder("Recording");
        recording_folder.add(this, "record");
        recording_folder.add({format: "png"}, "format", ["png", "jpg"]).onChange(value => {
            this.setup_capturer(value);
        });


        if (options.play === undefined) {options.play = true}
        if (options.loopMode === undefined) {options.loopMode = THREE.LoopRepeat}
        if (options.repetitions === undefined) {options.repetitions = 1}
        if (options.clampWhenFinished === undefined) {options.clampWhenFinished = true}

        for (let animation of animations) {
            let target = this.viewer.scene_tree.find(animation.path).object;
            let clip = this.loader.parseAnimations([animation.clip])[0];
            let action = this.mixer.clipAction(clip, target);
            action.clampWhenFinished = options.clampWhenFinished;
            action.setLoop(options.loopMode, options.repetitions);
            this.actions.push(action);
        }
        this.reset();
        if (options.play) {
            this.play();
        }
    }

    update() {
        if (this.playing) {
            this.mixer.update(this.clock.getDelta());
            this.viewer.set_dirty();

            if (this.actions.every((action) => action.paused)) {
                this.pause();
                for (let action of this.actions) {
                    action.reset();
                }
            }
        }
    }

    after_render() {
        if (this.recording) {
            this.capturer.capture(this.viewer.renderer.domElement);
        }
    }
}

// Generates a gradient texture without filling up
// an entire canvas. We simply create a 2x1 image
// containing only the two colored pixels and then
// set up the appropriate magnification and wrapping
// modes to generate the gradient automatically
function gradient_texture(top_color, bottom_color) {
    let colors = [bottom_color, top_color];

    let width = 1;
    let height = 2;
    let size = width * height;
    var data = new Uint8Array( 3 * size );
    for (let row=0; row < height; row++) {
        let color = colors[row];
        for (let col=0; col < width; col++) {
            let i = 3 * (row * width + col);
            for (let j=0; j < 3; j++) {
                data[i + j] = color[j];
            }
        }
    }
    var texture = new THREE.DataTexture( data, width, height, THREE.RGBFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.encoding = THREE.LinearEncoding;
    // By default, the points in our texture map to the center of
    // the pixels, which means that the gradient only occupies
    // the middle half of the screen. To get around that, we just have
    // to tweak the UV transform matrix
    texture.matrixAutoUpdate = false;
    texture.matrix.set(0.5, 0, 0.25,
                       0, 0.5, 0.25,
                       0, 0, 1);
    texture.needsUpdate = true
    return texture;
}


class Viewer {
    constructor(dom_element, animate) {
        this.dom_element = dom_element;
        this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.dom_element.appendChild(this.renderer.domElement);

        this.scene = create_default_scene();
        this.show_background();
        this.create_scene_tree();
        this.add_default_scene_elements();
        this.set_dirty();

        this.create_camera();


        // TODO: probably shouldn't be directly accessing window?
        window.onload = (evt) => this.set_3d_pane_size();
        window.addEventListener('resize', (evt) => this.set_3d_pane_size(), false);

        requestAnimationFrame(() => this.set_3d_pane_size());
        if (animate || animate === undefined) {
            this.animate();
        }
    }

    hide_background() {
        this.scene.background = null;
        this.set_dirty();
    }

    show_background() {
        let top_color = [135,206,250]; // lightskyblue
        let bottom_color = [25,25,112]; // midnightblue
        this.scene.background = gradient_texture(top_color, bottom_color);
        this.set_dirty();
    }

    set_dirty() {
        this.needs_render = true;
    }

    create_camera() {
        let mat = new THREE.Matrix4();
        mat.makeRotationX(Math.PI / 2);
        this.set_transform(["Cameras", "default", "rotated"], mat.toArray());

        let camera = new THREE.PerspectiveCamera(75, 1, 0.01, 100)
        this.set_camera(camera);

        this.set_object(["Cameras", "default", "rotated"], camera)
        camera.position.set(3, 1, 0);
    }

    create_default_spot_light() {
        var spot_light = new THREE.SpotLight(0xffffff, 0.8);
        spot_light.position.set(1.5, 1.5, 2);
        // Make light not cast shadows by default (effectively
        // disabling them, as there are no shadow-casting light
        // sources in the default configuration). This is toggleable
        // in the light options menu.
        spot_light.castShadow = false;
        spot_light.shadow.mapSize.width = 1024;  // default 512
        spot_light.shadow.mapSize.height = 1024; // default 512
        spot_light.shadow.camera.near = 0.5;     // default 0.5
        spot_light.shadow.camera.far = 50.;      // default 500
        return spot_light;
    }

    add_default_scene_elements() {
        var spot_light = this.create_default_spot_light();
        this.set_object(["Lights", "SpotLight"], spot_light);
        // By default, the spot light is turned off, since
        // it's primarily used for casting detailed shadows
        this.set_property(["Lights", "SpotLight"], "visible", false);

        var directional_light = new THREE.DirectionalLight(0xffffff, 0.7);
        directional_light.position.set(1.5, 1.5, 2);
        this.set_object(["Lights", "DirectionalLight"], directional_light);

        var ambient_light = new THREE.AmbientLight(0xffffff, 0.3);
        this.set_object(["Lights", "AmbientLight"], ambient_light);

        var fill_light = new THREE.DirectionalLight(0xffffff, 0.4);
        fill_light.position.set(-10, -10, 0);
        this.set_object(["Lights", "FillLight"], fill_light);

        var grid = new THREE.GridHelper(20, 40);
        grid.rotateX(Math.PI / 2);
        this.set_object(["Grid"], grid);

        var axes = new THREE.AxesHelper(0.5);
        // axes.visible = false;
        this.set_object(["Axes"], axes);
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
        this.scene_tree = new SceneNode(this.scene, scene_folder, () => this.set_dirty());
        let save_folder = this.gui.addFolder("Save / Load / Capture");
        save_folder.add(this, 'save_scene');
        save_folder.add(this, 'load_scene');
        save_folder.add(this, 'save_image');
        let back_folder = this.gui.addFolder("Background");
        back_folder.add(this, 'hide_background');
        back_folder.add(this, 'show_background');
        this.animator = new Animator(this);
        this.gui.close();
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
        this.set_dirty();
    }

    render() {
        this.controls.update();
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
        this.animator.after_render();
        this.needs_render = false;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.animator.update();
        if (this.needs_render) {
            this.render();
        }
    }

    capture_image() {
        this.render();
        return this.renderer.domElement.toDataURL();
    }

    save_image() {
        download_data_uri("meshcat.png", this.capture_image());
    }

    set_camera(obj) {
        this.camera = obj;
        this.controls = new THREE.OrbitControls(obj, this.dom_element);
        this.controls.enableKeys = false;
        this.controls.addEventListener('start', () => {this.set_dirty()});
        this.controls.addEventListener('change', () => {this.set_dirty()});
    }

    set_camera_from_json(data) {
        let loader = new THREE.ObjectLoader();
        loader.parse(data, (obj) => {
            console.log(obj);
            this.set_camera(obj);
        });
    }

    set_transform(path, matrix) {
        this.scene_tree.find(path).set_transform(matrix);
    }

    set_object(path, object) {
        this.scene_tree.find(path.concat(["<object>"])).set_object(object);
    }

    set_object_from_json(path, object_json) {
        object_json.geometries = object_json.geometries.map(handle_special_geometry);
        let loader = new THREE.ObjectLoader();
        loader.parse(object_json, (obj) => {
            if (obj.geometry.type == "BufferGeometry") {
                obj.geometry.computeVertexNormals();
            }
            obj.castShadow = true;
            obj.receiveShadow = true;
            // if (obj.name === "") {
            //     obj.name = "<object>";
            // }
            this.set_object(path, obj);
            this.set_dirty();
        });
    }

    delete_path(path) {
        if (path.length == 0) {
            console.error("Deleting the entire scene is not implemented")
        } else {
            this.scene_tree.delete(path);
        }
    }

    set_property(path, property, value) {
        this.scene_tree.find(path).set_property(property, value);
        // if (path[0] === "Cameras") {
        //     this.camera.updateProjectionMatrix();
        // }
    }

    set_animation(animations, options) {
        options = options || {};
        this.animator.load(animations, options);
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
            let path = split_path(cmd.path);
            this.set_transform(path, cmd.matrix);
        } else if (cmd.type == "delete") {
            let path = split_path(cmd.path);
            this.delete_path(path);
        } else if (cmd.type == "set_object") {
            let path = split_path(cmd.path);
            this.set_object_from_json(path, cmd.object);
        } else if (cmd.type == "set_property") {
            let path = split_path(cmd.path);
            this.set_property(path, cmd.property, cmd.value);
        } else if (cmd.type == "set_animation") {
            cmd.animations.forEach(animation => {
                animation.path = split_path(animation.path);
            });
            this.set_animation(cmd.animations, cmd.options);
        } else if (cmd.type == "set_control") {
            this.set_control(cmd.name, cmd.callback, cmd.value, cmd.min, cmd.max, cmd.step);
        }
        this.set_dirty();
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

    load_scene_from_json(json) {
        let loader = new THREE.ObjectLoader();
        this.scene_tree.dispose_recursive();
        this.scene = loader.parse(json);
        this.show_background();
        this.create_scene_tree();
        let cam_node = this.scene_tree.find(["Cameras", "default", "rotated", "<object>"]);
        if (cam_node.object.isCamera) {
            this.set_camera(cam_node.object);
        } else {
            this.create_camera();
        }
    }

    handle_load_file(input) {
        let file = input.files[0];
        if (!file) {
            return
        }
        let reader = new FileReader();
        let viewer = this;
        reader.onload = function(e) {
            let contents = this.result;
            let json = JSON.parse(contents);
            viewer.load_scene_from_json(json);
        };
        reader.readAsText(file);
    }

    // https://stackoverflow.com/a/26298948
    load_scene() {
        let input = document.createElement("input");
        input.type = "file";
        document.body.appendChild(input);
        let self = this;
        input.addEventListener("change", function() {
            console.log(this, self);
            self.handle_load_file(this);
            // handle_load_file(self)
        }, false);
        input.click();
        input.remove();
    }
}

function split_path(path_str) {
    return path_str.split("/").filter(x => x.length > 0);
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
	Viewer: Viewer,
    THREE: THREE
};
