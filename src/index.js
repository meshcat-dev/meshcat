import * as THREE from 'three';
var msgpack = require('@msgpack/msgpack');
var dat = require('dat.gui').default; // TODO: why is .default needed?
import {mergeBufferGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {OBJLoader2, MtlObjBridge} from 'wwobjloader2'
import {ColladaLoader} from 'three/examples/jsm/loaders/ColladaLoader.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MTLLoader} from 'three/examples/jsm/loaders/MTLLoader.js';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRButton } from 'three/examples/jsm/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory';
require('ccapture.js');

// We must implement extension types 0x16 and 0x17. The trick to
// decoding them is they must be converted from littleEndian.
const extensionCodec = new msgpack.ExtensionCodec();
// Uint32Array
extensionCodec.register({
  type: 0x16,
  encode: (obj) => {
    console.error("Uint32Array encode not implemented")
    return null;
  },
  decode: (data) => {
    const to_return = new Uint32Array(data.byteLength / 4);
    let dataview = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < to_return.length; i++) {
      to_return[i] = dataview.getUint32(i * 4, true);  // true b.c. littleEndian
    }
    return to_return
  },
});
   +
// Float32Array
extensionCodec.register({
  type: 0x17,
  encode: (obj) => {
    console.error("Float32Array encode not implemented")
    return null;
  },
  decode: (data) => {
    const to_return = new Float32Array(data.byteLength / 4);
    let dataview = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < to_return.length; i++) {
      to_return[i] = dataview.getFloat32(i * 4, true);  // true b.c. littleEndian
    }
    return to_return
  },
});

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

class Background extends THREE.Object3D {
    constructor() {
        super();
        this.isBackground = true;
        this.type = 'Background';

        // The controllable properties that can be set either via control or
        // set_property().
        this.top_color = new dat.color.Color(135, 206, 250);  // lightskyblue
        this.bottom_color = new dat.color.Color(25, 25, 112);  // midnightlblue
        this.render_environment_map = true;
        this.environment_map = null;
        this.visible = true;
        this.use_ar_background = false;

        // The textures associated with the background: either the map, the
        // gradient, or a white texture (for when the background isn't visible).
        this.textures = {
            "env_map": null,  // no default environment.
            "round": {
                "gradient": env_texture(this.top_color, this.bottom_color, true),
                "white": env_texture([255, 255, 255], [255, 255, 255], true)
            },
            "flat": {
                "gradient": env_texture(this.top_color, this.bottom_color, false),
                "white": env_texture([255, 255, 255], [255, 255, 255], false)
            }
        };
        // The state values that contributed to the current values of
        // scene.background and scene.environment. When the controllable
        // properties get twiddled, this state will be compared with that state
        // to determine the work necessary to update the background.
        this.state = {
            "top_color": null,
            "bottom_color": null,
            "environment_map": null,
            "render_map": null,
            "visible": true
        };
    }

    // Updates the background's state in the scene based on its requested
    // properties, its internal state, and the indication of whether the
    // background is visible or not.
    //
    // Changes to underlying maps (e.g., gradient or environment map) happen
    // regardless of the type of camera. However, the textures applied to
    // scene.background depend on whether the camera is perspective or not.
    update(scene, is_visible, is_perspective) {
        // TODO(SeanCurtis-TRI): If the background simply isn't visible, defer
        // the work until it is visible, perhaps?
        this.state.visible = is_visible;
        this.state.render_map = this.render_environment_map;
        // If the named environment map has changed, we need to load appropriately.
        if (this.environment_map !== this.state.environment_map) {
            if (this.environment_map == "" || this.environment_map == null) {
                this.environment_map = this.state.environment_map = null;
                this.textures.env_map = null;
            } else {
                this.textures.env_map =
                    load_env_texture(this.environment_map, this, scene,
                                     is_visible, is_perspective);
                if (this.textures.env_map == null) {
                    this.state.environment_map = this.environment_map = null;
                } else {
                    this.state.environment_map = this.environment_map;
                }
            }
        }
        // Possibly update the gradient textures if requested top/bottom colors
        // are different from the current state. But only if we're *using*
        // the gradient. Note: "using" is not the same as obviously drawing it
        // as a background. We use the gradient in the following circumstances:
        //
        //    - The background is visible and
        //         - there is no environment map (using gradient as environment) or
        //         - the state has been requested to not draw the env map as
        //           background, or
        //         - the camera is orthographic (can't use env_map as background).
        let using_gradient = !is_perspective ||
                             !this.render_environment_map ||
                             this.textures.env_map == null;
        if (is_visible && using_gradient &&
            (this.top_color !== this.state.top_color ||
             this.bottom_color !== this.state.bottom_color)) {
            this.state.top_color = this.top_color;
            this.state.bottom_color = this.bottom_color;
            let t = [this.state.top_color.r, this.state.top_color.g,
                     this.state.top_color.b];
            let b = [this.state.bottom_color.r, this.state.bottom_color.g,
                     this.state.bottom_color.b];
            this.textures.flat.gradient = env_texture(t, b, false);
            this.textures.round.gradient = env_texture(t, b, true);
        }
        // Both background and environment are white if the background isn't
        // visible.

        // A visible background is either the environment map or the gradient:
        // To be the map, the map must be defined, state.render_map is true,
        // and the camera is perspective. Otherwise gradient.
        // In immersive AR mode, we need the background to be transparent (so
        // that the camera comes through). So, we set the background to null,
        // but leave the normal semantics for environment so things keep
        // rendering the same.
        let cam_key = is_perspective ? "round" : "flat";
        scene.background =
            this.use_ar_background ?
                null :
                this.state.visible ?
                    (this.state.render_map && this.textures.env_map != null && is_perspective ?
                        this.textures.env_map :
                        this.textures[cam_key].gradient) :
                    this.textures[cam_key].white;
        // The environment logic is simpler. It only depends on the background
        // being visible and an environment map being defined. We'll always
        // use an available environment map for illumination, regardless of
        // camera projection type.
        scene.environment =
            this.state.visible ?
                (this.textures.env_map != null ?
                    this.textures.env_map :
                    this.textures.round.gradient) :
                this.textures.round.white;
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
        this.controllers = [];
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
        if (this.object.isEnvironment) {
            let intensity_controller = this.folder.add(this.object, "intensity").min(0).step(0.1).max(100);
            intensity_controller.onChange(() => this.on_update());
            this.controllers.push(intensity_controller);
        }
        if (this.object.isBackground) {
            // Changing the background gradient is cheap, so we'll change the
            // color in the onChange() callback (instead of the onChangeFinished)
            // callback -- it makes a more interactive experience.
            let top_controller = this.folder.addColor(this.object, "top_color");
            top_controller.onChange(() => this.on_update());
            this.controllers.push(top_controller);

            let bottom_controller = this.folder.addColor(this.object, "bottom_color");
            bottom_controller.onChange(() => this.on_update());
            this.controllers.push(bottom_controller);

            let map_controller = this.folder.add(this.object, "render_environment_map");
            map_controller.onChange(() => this.on_update());
            this.controllers.push(map_controller);
        }
    }

    // To *modulate* opacity, we need to store the baseline value. This should
    // be called before the "opacity" property of a Material is written to.
    cache_original_opacity(material) {
        if (material.meshcat_base_opacity === undefined) {
            material.meshcat_base_opacity = material.opacity;
        }
    }

    // Changing opacity involves coordinating multiple properties.
    set_opacity(material, opacity) {
        this.cache_original_opacity(material);
        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.depthWrite = true;
        // Transparency changes may require changes to the compiled shaders.
        // Setting needsUpdate will trigger that. See
        // https://github.com/mrdoob/three.js/issues/25307#issuecomment-1398151913
        material.needsUpdate = true;
    }

    // Visits all the materials in the graph rooted at node (including if node
    // is, itself, a material). For each material, applies the mat_operator
    // to that material.
    visit_materials(node, mat_operator) {
        if (node.isMaterial) {
            mat_operator(node);
        } else if (node.material) {
            mat_operator(node.material);
        }
        for (let child of node.children) {
            this.visit_materials(child, mat_operator);
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
            var _this = this;
            function setNodeColor(mat) {
                mat.color.setRGB(value[0], value[1], value[2]);
                _this.set_opacity(mat, value[3]);
            };
            this.visit_materials(this.object, setNodeColor);
        } else if (property == "opacity") {
            var _this = this;
            function setNodeOpacity(mat) {
                _this.set_opacity(mat, value);
            };
            this.visit_materials(this.object, setNodeOpacity);
        } else if (property == "modulated_opacity") {
            var _this = this;
            function setModulatedNodeOpacity(mat) {
                // In case set_opacity() has never been called before, we'll
                // call cache_original_opacity() to be safe.
                _this.cache_original_opacity(mat);
                _this.set_opacity(mat, mat.meshcat_base_opacity * value);
            };
            this.visit_materials(this.object, setModulatedNodeOpacity);
        } else if (property == "top_color" || property == "bottom_color") {
            // Top/bottom colors are stored as dat.color.Color
            this.object[property] = new dat.color.Color(value.map((x) => x * 255));
        } else {
            this.object[property] = value;
        }
        if (this.object.isBackground) {
            // If we've set values on the Background, we need to fire its on_update()).
            this.on_update();
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

        // Note, for some reason when you call `.max()` on a slider controller
        // it does correctly change how the slider behaves but does not change
        // the range of values that can be entered into the text box attached
        // to the slider. Oh well. We work around this by creating the slider
        // with an unreasonably huge range and then calling `.min()` and
        // `.max()` on it later.
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

// Generates a gradient texture for defining the environment.
// Because it's a linear gradient, we can rely on OpenGL to do the
// linear interpolation between two rows of colors. However, to
// serve as an environment texture for objects with PBR shaders,
// it needs to be at least 64-pixels wide. We have been unable to
// find supporting documentation for this requirement, but
// empirically, it is obvious. Reduce the width by even one pixel
// and any metallic surface reflects a black void.
function env_texture(top_color, bottom_color, is_perspective) {
    if (top_color == null || bottom_color == null) return null;
    let width = 64;
    let height = 2;
    let size = width * height;
    let data = new Uint8Array(4 * size);
    // Row 0 is all bottom; row 1 is all top.
    let i = 0;
    let j = width * 4;
    for (let c = 0; c < width; ++c) {
        for (let ch = 0; ch < 3; ++ch) {
            data[i + ch] = bottom_color[ch];
            data[j + ch] = top_color[ch];
        }
        data[i + 3] = 255;
        data[j + 3] = 255;
        i += 4;
        j += 4;
    }

    // TODO(SeanCurtis-TRI): There is something about equirectangular mapping
    // that can make the *actual* colors in the background different from the
    // specified colors. Typically, saturation is lower. This may be due to
    // hdr vs ldr images. This needs investigation.

    // When we are using an orthographic camera, we can't use environment
    // mapping. It must be UVMapping so it covers the screen.
    let mapping = is_perspective ? THREE.EquirectangularReflectionMapping :
                                   THREE.UVMapping;
    let texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat,
                                        THREE.UnsignedByteType, mapping,
                                        THREE.RepeatWrapping, THREE.ClampToEdgeWrapping,
                                        THREE.LinearFilter, THREE.LinearFilter, 1,
                                        THREE.LinearSRGBColorSpace);
    if (!is_perspective) {
        // By default, the points in our texture map to the center of
        // the pixels, which means that the gradient only occupies
        // the middle half of the screen. To get around that, we just have
        // to tweak the UV transform matrix
        texture.matrixAutoUpdate = false;
        texture.matrix.set(0.5, 0, 0.25,
            0, 0.5, 0.25,
            0, 0, 1);
        texture.needsUpdate = true
    }
    texture.needsUpdate = true;
    // Although both encoding and LinearEncoding are deprecated, THREE.js gets
    // *really* cranky if you don't include it.
    texture.encoding = THREE.LinearEncoding;
    return texture;
}

function load_env_texture(path, background, scene, is_visible, is_perspective) {
    // let has_error = false;
    let texture = new THREE.TextureLoader().load( path, undefined, undefined, () => {
        // onError; if, ultimately, there is a problem in loading this map, we
        // need to revert the environment map to being undefined.
        console.error(
            "Failure to load the requested environment map; reverting to none.",
            background.environment_map);
        background.environment_map = null;
        background.update(scene, is_visible, is_perspective);
     });
    if (texture != null) {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
    }
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
        this.webxr_session_active = false;
        this.xr_button = null;
        this.scene = create_default_scene();
        this.gui_controllers = {};
        this.keydown_callbacks = {};
        this.create_scene_tree();

        this.add_default_scene_elements();
        this.set_dirty();

        this.create_camera();
        this.num_messages_received = 0;

        this.is_perspective = true;

        // TODO: probably shouldn't be directly accessing window?
        window.onload = (evt) => this.set_3d_pane_size();
        window.addEventListener('resize', (evt) => this.set_3d_pane_size(), false);
        window.addEventListener('keydown', (evt) => {this.on_keydown(evt);});

        requestAnimationFrame(() => this.set_3d_pane_size());
        if (animate || animate === undefined) {
            this.animate();
        }
    }

    on_keydown(e) {
      if (e.code in this.keydown_callbacks) {
        for (const o of this.keydown_callbacks[e.code]) {
          o["callback"](e);
        }
      }
    }

    update_background() {
        let bg_parent = this.scene_tree.find(["Background"]);
        let bg = this.scene_tree.find(["Background", "<object>"]);
        let is_visible = bg_parent.object.visible && bg.object.visible;
        bg.object.update(this.scene, is_visible, this.is_perspective);
        this.set_dirty();
    }

    hide_background() {
        this.set_property(["Background"], "visible", false);
    }

    show_background() {
        this.set_property(["Background"], "visible", true);
        this.set_property(["Background", "<object>"], "visible", true);
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
            autoPlace: false,
            resizable: true
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

        this.set_object(["Background"], new Background());
        // Set the callbacks on "/Background" and "/Background/<object>" so that
        // toggling either path's visibility will affect the rendering.
        let bg_folder = this.scene_tree.find(["Background"]);
        // In SceneNode::set_property, we detect if a property of the background
        // has been set and call the callback. This makes changing the
        // visibility of the folder behave like the visibility of its <object>.
        bg_folder.object.isBackground = true;
        bg_folder.on_update = () => {
            this.update_background();
        };
        this.scene_tree.find(["Background", "<object>"]).on_update = () => {
            this.update_background();
        }
        this.update_background();
    }

    set_3d_pane_size(w, h) {
        if (w === undefined) {
            w = this.dom_element.offsetWidth;
        }
        if (h === undefined) {
            h = this.dom_element.offsetHeight;
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

    capture_image(w, h) {
        let w_prev = this.dom_element.offsetWidth;
        let h_prev = this.dom_element.offsetHeight;
        this.set_3d_pane_size(w, h);
        this.render();
        let data = this.renderer.domElement.toDataURL();
        this.set_3d_pane_size(w_prev, h_prev);
        return data;
    }

    save_image() {
        download_data_uri("meshcat.png", this.capture_image());
    }

    set_camera(obj) {
        if (this.webxr_session_active) {
            console.warn("Can't set camera during an active WebXR session.");
            return;
        }

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
        this.update_webxr_buttons();
        this.update_background()
    }

    set_camera_target(value) {
        this.controls.target.set(value[0], value[1], value[2]);
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
        // Recursively walk the tree rooted at node and enable shadows for all
        // Mesh nodes.
        let meshes_cast_shadows = (node) => {
            if (node.type === "Mesh") {
                node.castShadow = true;
                node.receiveShadow = true;
            }
            for (let i = 0; i < node.children.length; ++i) {
                meshes_cast_shadows(node.children[i]);
            }
        };
        let configure_obj = (obj) => {
            meshes_cast_shadows(obj);
            this.set_object(path, obj);
            this.set_dirty();
        };
        if (object_json.object.type == "_meshfile_object" && object_json.object.format == "gltf") {
            let loader = new GLTFLoader();
            loader.parse(object_json.object.data, path, (gltf) => {
                let scene = gltf.scene;
                if (scene === null) {
                    // TODO(SeanCurtis-TRI): What do I do in this case?
                    console.error("Gltf parsed with no scene!");
                } else {
                    let json = object_json.object;
                    if (json.matrix !== undefined) {
                        // The GLTFLoader doesn't swap from y-up to z-up. So, we'll do that here.
                        scene.matrix.fromArray(json.matrix);
                        let R = new THREE.Matrix4();
                        R = R.makeRotationX(Math.PI / 2);
                        // The y-up to z-up rotation should happen on the right to precondition the z-up pose stored in json.matrix.
                        scene.matrix.multiply(R);
                        if (json.matrixAutoUpdate !== undefined) scene.matrixAutoUpdate = json.matrixAutoUpdate;
                        if (scene.matrixAutoUpdate) scene.matrix.decompose(scene.position, scene.quaternion, scene.scale);

                        // TODO(SeanCurtis-TRI): ExtensibleObjectLoader::parseObject()
                        // does more operations on the resultant meshfile object
                        // than just the objects matrix. It also plays with
                        // various other render settings. They should be applied
                        // to objects loaded from .glTF. The application act
                        // may be more complex for configurations that aren't
                        // inherited by scene node children; they would have
                        // to be applied around the tree rooted at the visualized
                        // scene group.
                    }
                    configure_obj(scene);
                }
            });
        } else {
            let loader = new ExtensibleObjectLoader();
            loader.onTextureLoad = () => { this.set_dirty(); }
            loader.parse(object_json, (obj) => {
                if (obj.geometry !== undefined && obj.geometry.type == "BufferGeometry") {
                    if ((obj.geometry.attributes.normal === undefined) || obj.geometry.attributes.normal.count === 0) {
                        obj.geometry.computeVertexNormals();
                    }
                } else if (obj.type.includes("Camera")) {
                    this.set_camera(obj);
                    this.set_3d_pane_size();
                }
                configure_obj(obj);
            });
        }
    }

    delete_path(path) {
        if (path.length == 0) {
            console.error("Deleting the entire scene is not implemented")
        } else {
            this.scene_tree.delete(path);
        }
    }

    set_property(path, property, value) {
        if (path.length === 1 && path[0] === "Background" && property !== "visible") {
            console.warn('To set the Background property ' + property +
                         ', use the path "/Background/<object>" instead of just "/Background".');
            // We need to forward setting properties on Background to
            // Background/<object>.
            path = [path[0], "<object>"];
        }
        this.scene_tree.find(path).set_property(property, value);
        // if (path[0] === "Cameras") {
        //     this.camera.updateProjectionMatrix();
        // }
    }

    set_animation(animations, options) {
        options = options || {};
        this.animator.load(animations, options);
    }

    // keycode1 and keycode2 are the KeyboardEvent.code values, e.g. "KeyB",
    // https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values
    // Buttons have at most one keycode assigned to them (which causes the
    // button to callback to fire).  Sliders have two keycodes assigned to
    // them; one to decrease the value by step, the other to increase it.
    set_control(name, callback, value, min, max, step,
                keycode1, keycode2) {
        let my_callback = eval(callback);
        let handler = {};
        if (name in this.gui_controllers) {
            this.gui.remove(this.gui_controllers[name]);
        }
        if (value !== undefined) {
          handler[name] = value;
            this.gui_controllers[name] = this.gui.add(
                handler, name, min, max, step);
            this.gui_controllers[name].onChange(my_callback);
            function add_callback(viewer, keycode, increment) {
              if (keycode != undefined) {
                let keydown_callback = {name: name, callback: () => {
                  // Decrease value by step (within limits), and trigger
                  // callback.
                  value = viewer.gui_controllers[name].getValue();
                  let new_value =
                    Math.min(Math.max(value + increment, min), max);
                  viewer.gui_controllers[name].setValue(new_value);
                }};
                if (keycode in viewer.keydown_callbacks) {
                  viewer.keydown_callbacks[keycode].push(keydown_callback);
                } else {
                  viewer.keydown_callbacks[keycode] = [keydown_callback];
                }
              }
            }
            add_callback(this, keycode1, -step);
            add_callback(this, keycode2, +step);
        } else {
            handler[name] = my_callback;
            this.gui_controllers[name] = this.gui.add(handler, name);
            // The default layout for dat.GUI buttons is broken, with the button name artificially truncated at the same width that slider names are truncated.  We fix that here.
            this.gui_controllers[name].domElement.parentElement.querySelector('.property-name').style.width="100%";
            if (keycode1 != undefined) {
              let keydown_callback = {name: name, callback: my_callback};
              if (keycode1 in this.keydown_callbacks) {
                this.keydown_callbacks[keycode1].push(keydown_callback);
              } else {
                this.keydown_callbacks[keycode1] = [keydown_callback];
              }
            }
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
        // Remove any callbacks associated with this name.
        for (let code in this.keydown_callbacks) {
          let i=this.keydown_callbacks[code].length;
          while (i--) {
            if (this.keydown_callbacks[code][i]["name"] == name) {
              this.keydown_callbacks[code].splice(i, 1);
            }
          }
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
        } else if (cmd.type == "set_target") {
            this.set_camera_target(cmd.value);
        } else if (cmd.type == "set_control") {
            this.set_control(cmd.name, cmd.callback, cmd.value, cmd.min, cmd.max, cmd.step, cmd.keycode1, cmd.keycode2);
        } else if (cmd.type == "set_control_value") {
            this.set_control_value(cmd.name, cmd.value, cmd.invoke_callback);
        } else if (cmd.type == "delete_control") {
            this.delete_control(cmd.name);
        } else if (cmd.type == "capture_image") {
            let w = cmd.xres || 1920;
            let h = cmd.yres || 1080;
            w = w / this.renderer.getPixelRatio();
            h = h / this.renderer.getPixelRatio();
            let imgdata = this.capture_image(w, h);
            this.connection.send(JSON.stringify({
                'type': 'img',
                'data': imgdata
            }));
        } else if (cmd.type == "save_image") {
            this.save_image()
        } else if (cmd.type == "enable_webxr") {
            this.enable_webxr(cmd.mode);
        } else if (cmd.type == "visualize_vr_controller"){
            this.visualize_vr_controllers();
        }

        this.set_dirty();
    }

    decode(message) {
      return msgpack.decode(new Uint8Array(message.data), { extensionCodec });
    }

    handle_command_bytearray(bytearray) {
      let decoded = msgpack.decode(bytearray, {extensionCodec});
      this.handle_command(decoded);
    }

    handle_command_message(message) {
      this.num_messages_received++;
      let decoded = this.decode(message);
      this.handle_command(decoded);
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

    update_webxr_buttons(){
        this.is_perspective = this.camera.isPerspectiveCamera === true;
        const xrButton = document.getElementById('XRButton');
        const vrButton = document.getElementById('VRButton');
        if (!this.is_perspective) {
            if (xrButton) {
                // When loading the site for the first time, the text of the buttons gets
                // updated somewhere by three.js. Since we can't control the order
                // of execution, we have an extra onload to cover the text change for the first time load.
                window.onload = function() {
                    xrButton.textContent = "AR/VR Disabled for Orthographic Cameras";
                }
                xrButton.textContent = "AR/VR Disabled for Orthographic Cameras";
                xrButton.disabled = true;
                console.warn("WebXR and VR Buttons are disabled because the camera is in Orthographic view.");
            } else if (vrButton) {
                window.onload = function() {
                    vrButton.textContent = "AR/VR Disabled for Orthographic Cameras";
                }
                vrButton.textContent = "AR/VR Disabled for Orthographic Cameras";
                vrButton.disabled = true;
                console.warn("WebXR and VR Buttons are disabled because the camera is in Orthographic view.");
            }
        }
        else {
            if (xrButton) {
                    xrButton.textContent = "START XR";
                    xrButton.disabled = false;

            } else if (vrButton) {
                    vrButton.textContent = "START VR";
                    vrButton.disabled = false;
            }
        }

    }

    // Adds controllers to the VR/XR scene.
    // TODO(WawasCode): Create a VR UI.
    visualize_vr_controllers() {
        const controllerModelFactory = new XRControllerModelFactory();

        const pointing_ray_vectors = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
        ]);

        const pointing_ray = new THREE.Line(pointing_ray_vectors);
        pointing_ray.scale.z = 5;  // Limit the length of the ray.

        const controllers = [];
        // Loop through all controllers. If there are fewer than 2 Controllers
        // it gets handled by XRControllerModelFactory in the background.
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            controller.add(pointing_ray.clone());

            // Create a wrapper group for the controller
            // and undo the rotation since
            // the world is rotate by -90° around x.
            const controllerWrapper = new THREE.Group();
            controllerWrapper.rotation.x = Math.PI / 2;
            controllerWrapper.add(controller);
            this.scene.add(controllerWrapper);
            controllers.push(controllerWrapper);

            const grip = this.renderer.xr.getControllerGrip(i);
            // Undo the rotation of the grip.
            const gripWrapper = new THREE.Group();
            gripWrapper.rotation.x = Math.PI / 2;
            gripWrapper.add(grip);
            this.scene.add(gripWrapper);

            const model = controllerModelFactory.createControllerModel(grip);
            grip.add(model);
        }

        return controllers;
    }

    // Enables webXR and all its functionalities.
    // If mode == "vr", then we enable the VRButton.
    // If mode == "ar", then we enable the XRButton.
    // All other strings report an error.
    // When in XR/VR mode the meshcat controls are disabled.
    enable_webxr(mode = "ar") {
        if (this.renderer.xr.enabled) {
            console.warn("WebXR/VR has already been enabled.");
            return;
        }
        if (!this.camera.isPerspectiveCamera)
        {
            console.error("Can't enable webxr with an orthographic camera.");
            return;
        }
        if (mode == "vr") {
            this.xr_button = VRButton.createButton(this.renderer);
        } else if (mode == "ar") {
            this.xr_button = XRButton.createButton(this.renderer);
        } else {
            console.error(
                `enable_webxr takes either "ar" or "vr" as arguments. Given "${mode}".`);
            return;
        }
        this.renderer.xr.enabled = true;

        document.body.appendChild(this.xr_button);

        const original_update_projection_matrix = this.camera.updateProjectionMatrix;
        this.update_webxr_buttons();
        this.renderer.xr.addEventListener('sessionstart', () => {
            /* When the current session starts, we want the VR camera at the
             position of the scene's camera but not exactly the same rotation.
             We want it pointing along the same heading, but if the headset
             is level, the camera should be looking in a direction parallel with
             the world ground plane.

             If the user has positioned the camera so it is looking up or down
             at a significant angle, after switching to VR/AR mode, the user
             will have to tilt their head up/down a comparable angle to
             reproduce the equivalent view. */
            /*
            Note: Requesting an "AR" session does not guarantee an AR session will be initiated.
            The request could automatically devolve to a VR session if AR isn’t fully supported on the system,
            but VR is. There's potential for a discrepancy between the requested and the actual mode.
            */
            if (mode == "ar"){
                this.set_property(["Background"], "use_ar_background", true);
            }
            this.webxr_session_active = true;
            console.info("Immersive session starting, controls are being removed.")
            this.renderer.xr.getSession().requestReferenceSpace("local")
                                         .then((refSpace) => {
                let Cz_W = new THREE.Vector3();
                Cz_W.setFromMatrixColumn(this.camera.matrixWorld, 2);
                if (Math.abs(Cz_W.y) > 0.5) {
                    console.warn("The view camera was pointed up or down a " +
                                 "significant amount when entering XR mode. " +
                                 "Tilt the headset the same amount to see " +
                                 "the camera's original target.");
                }
                let heading_W = new THREE.Vector3(Cz_W.x, 0, Cz_W.z);
                heading_W.normalize();
                let Wz = new THREE.Vector3(0, 0, 1);
                let quat_CW = new THREE.Quaternion();
                quat_CW.setFromUnitVectors(heading_W, Wz);

                /* This gets *initialized* as p_CW_W, we'll rotate it in place
                 to make it *truly* p_CW_C. */
                const p_CW_C = this.camera.position.clone().negate();
                p_CW_C.applyQuaternion(quat_CW);

                let transform = new XRRigidTransform(p_CW_C, quat_CW);
                this.renderer.xr.setReferenceSpace(
                    refSpace.getOffsetReferenceSpace(transform));
            });

            this.camera.updateProjectionMatrix = () => {
                console.warn("Updating the camera projection matrix is disallowed in immersive mode.");
            };
            this.renderer.setAnimationLoop(() => {
                this.renderer.render(this.scene, this.camera);
            });
        });

        this.renderer.xr.addEventListener('sessionend', () => {
            this.webxr_session_active = false;
            if (mode == "ar"){
                this.set_property(["Background"], "use_ar_background", false);
            }
            this.renderer.setAnimationLoop(null); // Reset the animation loop to its default state (null).
            this.camera.updateProjectionMatrix = original_update_projection_matrix;
        });
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

export { Viewer, THREE, msgpack };
