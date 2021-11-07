var THREE = require('three');
var msgpack = require('msgpack-lite');
var dat = require('dat.gui').default; // TODO: why is .default needed?
import {mergeBufferGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {OBJLoader2, MtlObjBridge} from 'wwobjloader2'
import {ColladaLoader} from 'three/examples/jsm/loaders/ColladaLoader.js';
import {MTLLoader} from 'three/examples/jsm/loaders/MTLLoader.js';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
require('ccapture.js');

// Merges a hierarchy of collada mesh geometries into a single
// `BufferGeometry` object:
//   * A new merged `BufferGeometry` if the input contains meshes
//   * empty `BufferGeometry` otherwise
function merge_geometries(object, preserve_materials = false) {
    let materials = [];
    let geometries = [];
    let root_transform = object.matrix.clone();
    function collectGeometries(node, parent_transform) {
        let transform = parent_transform.clone().multiply(node.matrix);
        if (node.type==='Mesh') {
            node.geometry.applyMatrix4(transform);
            geometries.push(node.geometry);
            materials.push(node.material);
        }
        for (let child of node.children) {
            collectGeometries(child, transform);
        }
    }
    collectGeometries(object, root_transform);
    let result = null;
    if (geometries.length == 1) {
        result =  geometries[0];
        if (preserve_materials) {
            result.material = materials[0];
        }
    } else if (geometries.length > 1) {
        result = mergeBufferGeometries(geometries, true);
        if (preserve_materials) {
            result.material = materials;
        }
    } else {
        result = new THREE.BufferGeometry();
    }
    return result;
}

// Handler for special texture types that we want to support
// in addition to whatever three.js supports. This function
// takes a json object representing a single texture, and should
// return either:
//   * A new `THREE.Texture` if that json represents a special texture
//   * `null` otherwise
function handle_special_texture(json) {
    if (json.type == "_text") {
        let canvas = document.createElement('canvas');
        // canvas width and height should be in the power of 2; otherwise although
        // the page usually loads successfully, WebGL does complain/warn
        canvas.width = 256;
        canvas.height = 256;
        let ctx = canvas.getContext('2d');
        ctx.textAlign = "center";
        let font_size = json.font_size;
        // auto-resing the font_size to fit in the canvas
        ctx.font = font_size + "px " + json.font_face;
        while (ctx.measureText(json.text).width > canvas.width) {
            font_size--;
            ctx.font = font_size + "px " + json.font_face;
        }
        ctx.fillText(json.text, canvas.width / 2, canvas.height / 2);
        let canvas_texture = new THREE.CanvasTexture(canvas);
        canvas_texture.uuid = json.uuid;
        return canvas_texture;
    } else {
        return null;
    }
}

// Handler for special geometry types that we want to support
// in addition to whatever three.js supports. This function
// takes a json object representing a single geometry, and should
// return either:
//   * A new `THREE.Mesh` if that json represents a special geometry
//   * `null` otherwise
function handle_special_geometry(geom) {
    if (geom.type == "_meshfile") {
        console.warn("_meshfile is deprecated. Please use _meshfile_geometry for geometries and _meshfile_object for objects with geometry and material");
        geom.type = "_meshfile_geometry";
    }
    if (geom.type == "_meshfile_geometry") {
        if (geom.format == "obj") {
            let loader = new OBJLoader2();
            let obj = loader.parse(geom.data + "\n");
            let loaded_geom = merge_geometries(obj);
            loaded_geom.uuid = geom.uuid;
            return loaded_geom;
        } else if (geom.format == "dae") {
            let loader = new ColladaLoader();
            let obj = loader.parse(geom.data);
            let result = merge_geometries(obj.scene);
            result.uuid = geom.uuid;
            return result;
        } else if (geom.format == "stl") {
            let loader = new STLLoader();
            let loaded_geom = loader.parse(geom.data.buffer);
            loaded_geom.uuid = geom.uuid;
            return loaded_geom;
        } else {
            console.error("Unsupported mesh type:", geom);
            return null;
        }
    }
    return null;
}

// The ExtensibleObjectLoader extends the THREE.ObjectLoader
// interface, while providing some hooks for us to perform some
// custom loading for things other than three.js native JSON.
//
// We currently use this class to support some extensions to
// three.js JSON for objects which are easy to construct in
// javascript but hard to construct in Python and/or Julia.
// For example, we perform the following transformations:
//
//   * Converting "_meshfile" geometries into actual meshes
//     using the THREE.js native mesh loaders
//   * Converting "_text" textures into text by drawing the
//     requested text onto a canvas.
class ExtensibleObjectLoader extends THREE.ObjectLoader {
    delegate(special_handler, base_handler, json, additional_objects) {
        let result = {};
        if (json === undefined) {
            return result;
        }
        let remaining_json = [];
        for (let data of json) {
            let x = special_handler(data);
            if (x !== null) {
                result[x.uuid] = x;
            } else {
                remaining_json.push(data);
            }
        }
        return Object.assign(result, base_handler(remaining_json, additional_objects));
    }

    parseTextures(json, images) {
        return this.delegate(handle_special_texture,
                             super.parseTextures,
                             json, images);
    }

    parseGeometries(json, shapes) {
        return this.delegate(handle_special_geometry,
                             super.parseGeometries,
                             json, shapes);
    }

    parseObject(json, geometries, materials) {
        if (json.type == "_meshfile_object") {
            let geometry;
            let material;
            let manager = new THREE.LoadingManager();
            let path = ( json.url === undefined ) ? undefined : THREE.LoaderUtils.extractUrlBase( json.url );
            manager.setURLModifier(url => {
                if (json.resources[url] !== undefined) {
                    return json.resources[url];
                }
                return url;
            });
            if (json.format == "obj") {
                let loader = new OBJLoader2(manager);
                if (json.mtl_library) {
                    let mtl_loader = new MTLLoader(manager);
                    let mtl_parse_result = mtl_loader.parse(json.mtl_library + "\n", "");
                    let materials = MtlObjBridge.addMaterialsFromMtlLoader(mtl_parse_result);
                    loader.setMaterials(materials);
                    this.onTextureLoad();
                }
                let obj = loader.parse(json.data + "\n", path);
                geometry = merge_geometries(obj, true);
                geometry.uuid = json.uuid;
                material = geometry.material;
            } else if (json.format == "dae") {
                let loader = new ColladaLoader(manager);
                loader.onTextureLoad = this.onTextureLoad;
                let obj = loader.parse(json.data, path);
                geometry = merge_geometries(obj.scene, true);
                geometry.uuid = json.uuid;
                material = geometry.material;
            } else if (json.format == "stl") {
                let loader = new STLLoader();
                geometry = loader.parse(json.data.buffer, path);
                geometry.uuid = json.uuid;
                material = geometry.material;
            } else {
                console.error("Unsupported mesh type:", json);
                return null;
            }
            let object = new THREE.Mesh( geometry, material );

            // Copied from ObjectLoader
            object.uuid = json.uuid;

            if ( json.name !== undefined ) object.name = json.name;

            if ( json.matrix !== undefined ) {

                object.matrix.fromArray( json.matrix );

                if ( json.matrixAutoUpdate !== undefined ) object.matrixAutoUpdate = json.matrixAutoUpdate;
                if ( object.matrixAutoUpdate ) object.matrix.decompose( object.position, object.quaternion, object.scale );

            } else {

                if ( json.position !== undefined ) object.position.fromArray( json.position );
                if ( json.rotation !== undefined ) object.rotation.fromArray( json.rotation );
                if ( json.quaternion !== undefined ) object.quaternion.fromArray( json.quaternion );
                if ( json.scale !== undefined ) object.scale.fromArray( json.scale );

            }

            if ( json.castShadow !== undefined ) object.castShadow = json.castShadow;
            if ( json.receiveShadow !== undefined ) object.receiveShadow = json.receiveShadow;

            if ( json.shadow ) {

                if ( json.shadow.bias !== undefined ) object.shadow.bias = json.shadow.bias;
                if ( json.shadow.radius !== undefined ) object.shadow.radius = json.shadow.radius;
                if ( json.shadow.mapSize !== undefined ) object.shadow.mapSize.fromArray( json.shadow.mapSize );
                if ( json.shadow.camera !== undefined ) object.shadow.camera = this.parseObject( json.shadow.camera );

            }

            if ( json.visible !== undefined ) object.visible = json.visible;
            if ( json.frustumCulled !== undefined ) object.frustumCulled = json.frustumCulled;
            if ( json.renderOrder !== undefined ) object.renderOrder = json.renderOrder;
            if ( json.userjson !== undefined ) object.userjson = json.userData;
            if ( json.layers !== undefined ) object.layers.mask = json.layers;

            return object;
        } else {
            return super.parseObject(json, geometries, materials);
        }
    }
}


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

                if (this.object.shadow !== undefined) {
                    // Light source radius
                    let radius_controller = this.folder.add(this.object.shadow, "radius").min(0).step(0.05).max(3.0);
                    radius_controller.onChange(() => this.on_update());
                    this.controllers.push(radius_controller);
                }
            }
            // Point light falloff distance
            if (this.object.distance !== undefined){
                let distance_controller = this.folder.add(this.object, "distance").min(0).step(0.1).max(100.0);
                distance_controller.onChange(() => this.on_update());
                this.controllers.push(distance_controller);
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
        } else if (property === "color") {
            function setNodeColor(node, value) {
                if (node.material) {
                    node.material.color.setRGB(value[0], value[1], value[2])

                    let alpha = value[3]
                    node.material.opacity = alpha 
                    if(alpha != 1.) {
                       node.material.transparent = true
                    } 
                    else {
                        node.material.transparent = false
                    }
                }
                for (let child of node.children) {
                    setNodeColor(child, value);
                }
            }
            setNodeColor(this.object, value)
        } else if (property == "top_color" || property == "bottom_color") {
            this.object[property] = value.map((x) => x * 255);
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
        if (Array.isArray(object.material)) {
            for (let material of object.material) {
                if (material.map) {
                    material.map.dispose();
                }
                material.dispose();
            }
        } else {
            if (object.material.map) {
                object.material.map.dispose();
            }
            object.material.dispose();
        }
    }
}

function create_default_scene() {
    var scene = new THREE.Scene();
    scene.name = "Scene";
    scene.rotateX(-Math.PI / 2);
    return scene;
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
    let blob = new Blob([contents], {
        type: mime
    });
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
        this.time = 0;
        this.time_scrubber = null;
        this.setup_capturer("png");
        this.duration = 0;
    }

    setup_capturer(format) {
        this.capturer = new window.CCapture({
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

    display_progress(time) {
        this.time = time;
        if (this.time_scrubber !== null) {
            this.time_scrubber.updateDisplay();
        }
    }

    seek(time) {
        this.actions.forEach((action) => {
            action.time = Math.max(0, Math.min(action._clip.duration, time));
        });
        this.mixer.update(0);
        this.viewer.set_dirty();
    }

    reset() {
        for (let action of this.actions) {
            action.reset();
        }
        this.display_progress(0);
        this.mixer.update(0);
        this.setup_capturer(this.capturer.format);
        this.viewer.set_dirty();
    }

    clear() {
        remove_folders(this.folder);
        this.mixer.stopAllAction();
        this.actions = [];
        this.duration = 0;
        this.display_progress(0);
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

        // Note, for some reason when you call `.max()` on a slider controller it does
        // correctly change how the slider behaves but does not change the range of values
        // that can be entered into the text box attached to the slider. Oh well. We work
        // around this by creating the slider with an unreasonably huge range and then calling
        // `.min()` and `.max()` on it later.
        this.time_scrubber = folder.add(this, "time", 0, 1e9, 0.001);
        this.time_scrubber.onChange((value) => this.seek(value));

        folder.add(this.mixer, "timeScale").step(0.01).min(0);
        let recording_folder = folder.addFolder("Recording");
        recording_folder.add(this, "record");
        recording_folder.add({format: "png"}, "format", ["png", "jpg"]).onChange(value => {
            this.setup_capturer(value);
        });


        if (options.play === undefined) {
            options.play = true
        }
        if (options.loopMode === undefined) {
            options.loopMode = THREE.LoopRepeat
        }
        if (options.repetitions === undefined) {
            options.repetitions = 1
        }
        if (options.clampWhenFinished === undefined) {
            options.clampWhenFinished = true
        }

        this.duration = 0;
        this.progress = 0;
        for (let animation of animations) {
            let target = this.viewer.scene_tree.find(animation.path).object;
            let clip = THREE.AnimationClip.parse(animation.clip);
            // Ensure the clip has a proper UUID (by default it's undefined).
            // The animation mixer uses that UUID internally, and not setting it
            // can result in animations accidentally overwriting each other's
            // properties.
            clip.uuid = THREE.MathUtils.generateUUID();
            let action = this.mixer.clipAction(clip, target);
            action.clampWhenFinished = options.clampWhenFinished;
            action.setLoop(options.loopMode, options.repetitions);
            this.actions.push(action);
            this.duration = Math.max(this.duration, clip.duration);
        }
        this.time_scrubber.min(0);
        this.time_scrubber.max(this.duration);
        this.reset();
        if (options.play) {
            this.play();
        }
    }

    update() {
        if (this.playing) {
            this.mixer.update(this.clock.getDelta());
            this.viewer.set_dirty();
            if (this.duration != 0) {
                let current_time = this.actions.reduce((acc, action) => {
                    return Math.max(acc, action.time);
                }, 0);
                this.display_progress(current_time);
            } else {
                this.display_progress(0);
            }

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
    var data = new Uint8Array(3 * size);
    for (let row = 0; row < height; row++) {
        let color = colors[row];
        for (let col = 0; col < width; col++) {
            let i = 3 * (row * width + col);
            for (let j = 0; j < 3; j++) {
                data[i + j] = color[j];
            }
        }
    }
    var texture = new THREE.DataTexture(data, width, height, THREE.RGBFormat);
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
    constructor(dom_element, animate, renderer) {
        this.dom_element = dom_element;
        if (renderer === undefined) {
            this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.dom_element.appendChild(this.renderer.domElement);
        } else {
            this.renderer = renderer;
        }
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.scene = create_default_scene();
        this.gui_controllers = {};
        this.create_scene_tree();

        this.add_default_scene_elements();
        this.set_dirty();

        this.create_camera();
        this.num_messages_received = 0;

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
        var top_color = this.scene_tree.find(["Background"]).object.top_color;
        var bottom_color =
            this.scene_tree.find(["Background"]).object.bottom_color;
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
        spot_light.shadow.bias = -0.001;
        return spot_light;
    }

    add_default_scene_elements() {
        var spot_light = this.create_default_spot_light();
        this.set_object(["Lights", "SpotLight"], spot_light);
        // By default, the spot light is turned off, since
        // it's primarily used for casting detailed shadows
        this.set_property(["Lights", "SpotLight"], "visible", false);

        var point_light_px = new THREE.PointLight(0xffffff, 0.4);
        point_light_px.position.set(1.5, 1.5, 2);
        point_light_px.castShadow = false;
        point_light_px.distance = 10.0;
        point_light_px.shadow.mapSize.width = 1024;  // default 512
        point_light_px.shadow.mapSize.height = 1024; // default 512
        point_light_px.shadow.camera.near = 0.5;     // default 0.5
        point_light_px.shadow.camera.far = 10.;      // default 500
        point_light_px.shadow.bias = -0.001;      // Default 0
        this.set_object(["Lights", "PointLightNegativeX"], point_light_px);

        var point_light_nx = new THREE.PointLight(0xffffff, 0.4);
        point_light_nx.position.set(-1.5, -1.5, 2);
        point_light_nx.castShadow = false;
        point_light_nx.distance = 10.0;
        point_light_nx.shadow.mapSize.width = 1024;  // default 512
        point_light_nx.shadow.mapSize.height = 1024; // default 512
        point_light_nx.shadow.camera.near = 0.5;     // default 0.5
        point_light_nx.shadow.camera.far = 10.;      // default 500
        point_light_nx.shadow.bias = -0.001;      // Default 0
        this.set_object(["Lights", "PointLightPositiveX"], point_light_nx);

        var ambient_light = new THREE.AmbientLight(0xffffff, 0.3);
        ambient_light.intensity = 0.6;
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
        this.gui = new dat.GUI({
            autoPlace: false
        });
        this.dom_element.parentElement.appendChild(this.gui.domElement);
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
        this.animator = new Animator(this);
        this.gui.close();

        this.set_property(["Background"],
            "top_color", [135/255, 206/255, 250/255]); // lightskyblue
        this.set_property(["Background"],
            "bottom_color", [25/255, 25/255, 112/255]); // midnightblue
        this.scene_tree.find(["Background"]).on_update = () => {
            if (this.scene_tree.find(["Background"]).object.visible)
                this.show_background();
            else
                this.hide_background();
        };
        this.show_background();
    }

    set_3d_pane_size(w, h) {
        if (w === undefined) {
            w = this.dom_element.offsetWidth;
        }
        if (h === undefined) {
            h = window.innerHeight;
        }
        if (this.camera.type == "OrthographicCamera") {
            this.camera.right = this.camera.left + w*(this.camera.top - this.camera.bottom)/h;
        } else {
            this.camera.aspect = w / h;
        }
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
        this.controls = new OrbitControls(obj, this.dom_element);
        this.controls.enableKeys = false;
        this.controls.screenSpacePanning = true;  // see https://github.com/rdeits/MeshCat.jl/issues/132
        this.controls.addEventListener('start', () => {
            this.set_dirty()
        });
        this.controls.addEventListener('change', () => {
            this.set_dirty()
        });
    }

    set_camera_from_json(data) {
        let loader = new ExtensibleObjectLoader();
        loader.parse(data, (obj) => {
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
        let loader = new ExtensibleObjectLoader();
        loader.onTextureLoad = () => {this.set_dirty();}
        loader.parse(object_json, (obj) => {
            if (obj.geometry !== undefined && obj.geometry.type == "BufferGeometry") {
                if ((obj.geometry.attributes.normal === undefined) || obj.geometry.attributes.normal.count === 0) {
                    obj.geometry.computeVertexNormals();
                }
            } else if (obj.type.includes("Camera")) {
                this.set_camera(obj);
                this.set_3d_pane_size();                
            }
            obj.castShadow = true;
            obj.receiveShadow = true;
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
        if (path[0] === "Background") {
            // The background is not an Object3d, so needs a little help.
            this.scene_tree.find(path).on_update();
        }
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
        if (name in this.gui_controllers) {
            this.gui.remove(this.gui_controllers[name]);
        }
        if (value !== undefined) {
            handler[name] = value;
            this.gui_controllers[name] = this.gui.add(
                handler, name, min, max, step);
            this.gui_controllers[name].onChange(eval(callback));
        } else {
            handler[name] = eval(callback);
            this.gui_controllers[name] = this.gui.add(handler, name);
            // The default layout for dat.GUI buttons is broken, with the button name artificially truncated at the same width that slider names are truncated.  We fix that here.
            this.gui_controllers[name].domElement.parentElement.querySelector('.property-name').style.width="100%";
        }
    }

    set_control_value(name, value, invoke_callback=true) {
        if (name in this.gui_controllers && this.gui_controllers[name] 
            instanceof dat.controllers.NumberController) {
            if (invoke_callback) {
              this.gui_controllers[name].setValue(value);              
            } else {
              this.gui_controllers[name].object[name] = value;
              this.gui_controllers[name].updateDisplay();
            }
        }
    }

    delete_control(name) {
        if (name in this.gui_controllers) {
            this.gui.remove(this.gui_controllers[name]);
            delete this.gui_controllers[name];
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
        } else if (cmd.type == "set_control_value") {
            this.set_control_value(cmd.name, cmd.value, cmd.invoke_callback);
        } else if (cmd.type == "delete_control") {
            this.delete_control(cmd.name);
        } else if (cmd.type == "capture_image") {
            let imgdata = this.capture_image();
            this.connection.send(JSON.stringify({
                'type': 'img',
                'data': imgdata
            }));
        } else if (cmd.type == "save_image") {
            this.save_image()
        }
        this.set_dirty();
    }

    handle_command_bytearray(bytearray) {
        let decoded = msgpack.decode(bytearray);
        this.handle_command(decoded);
    }
    
    handle_command_message(message) {
        this.num_messages_received++;
        this.handle_command_bytearray(new Uint8Array(message.data));
    }

    connect(url) {
        if (url === undefined) {
            url = `ws://${location.host}`;
        }
        if (location.protocol == "https:") {
            url = url.replace("ws:", "wss:");
        }
        this.connection = new WebSocket(url);
        this.connection.binaryType = "arraybuffer";
        this.connection.onmessage = (msg) => this.handle_command_message(msg);
        this.connection.onclose = function(evt) {
            console.log("onclose:", evt);
        }
    }

    save_scene() {
        download_file("scene.json", JSON.stringify(this.scene.toJSON()));
    }

    load_scene_from_json(json) {
        let loader = new ExtensibleObjectLoader();
        loader.onTextureLoad = () => {this.set_dirty();}
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

export { Viewer, THREE };
