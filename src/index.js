import * as THREE from 'three';
// var msgpack = require('@msgpack/msgpack');
var dat = require('dat.gui').default; // TODO: why is .default needed?
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OBJLoader2, MtlObjBridge } from 'wwobjloader2'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRButton } from 'three/examples/jsm/webxr/XRButton.js';
import { Viewer } from './viewer.js';
// import {} from './codec.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory';
require('ccapture.js');

// These are bundled as data:// URIs via our webpack.config.js.
const meshcat_inline_assets = {
    'basis_transcoder.js': new URL(
        'three/examples/jsm/libs/basis/basis_transcoder.js',
        import.meta.url).href,
    'basis_transcoder.wasm': new URL(
        'three/examples/jsm/libs/basis/basis_transcoder.wasm',
        import.meta.url).href,
    'draco_decoder.wasm': new URL(
        'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm',
        import.meta.url).href,
    'draco_wasm_wrapper.js': new URL(
        'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js',
        import.meta.url).href,
};

// const meshcat_loading_manager = new THREE.LoadingManager();
// meshcat_loading_manager.setURLModifier(url => {
//     if (url in meshcat_inline_assets) {
//         return meshcat_inline_assets[url];
//     }
//     return MeshCat.THREE.DefaultLoadingManager.resolveURL(url);
// });


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
        if (node.type === 'Mesh') {
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
        result = geometries[0];
        if (preserve_materials) {
            result.material = materials[0];
        }
    } else if (geometries.length > 1) {
        result = mergeGeometries(geometries, true);
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
            let path = (json.url === undefined) ? undefined : THREE.LoaderUtils.extractUrlBase(json.url);
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
            let object = new THREE.Mesh(geometry, material);

            // Copied from ObjectLoader
            object.uuid = json.uuid;

            if (json.name !== undefined) object.name = json.name;

            if (json.matrix !== undefined) {

                object.matrix.fromArray(json.matrix);

                if (json.matrixAutoUpdate !== undefined) object.matrixAutoUpdate = json.matrixAutoUpdate;
                if (object.matrixAutoUpdate) object.matrix.decompose(object.position, object.quaternion, object.scale);

            } else {

                if (json.position !== undefined) object.position.fromArray(json.position);
                if (json.rotation !== undefined) object.rotation.fromArray(json.rotation);
                if (json.quaternion !== undefined) object.quaternion.fromArray(json.quaternion);
                if (json.scale !== undefined) object.scale.fromArray(json.scale);

            }

            if (json.castShadow !== undefined) object.castShadow = json.castShadow;
            if (json.receiveShadow !== undefined) object.receiveShadow = json.receiveShadow;

            if (json.shadow) {

                if (json.shadow.bias !== undefined) object.shadow.bias = json.shadow.bias;
                if (json.shadow.radius !== undefined) object.shadow.radius = json.shadow.radius;
                if (json.shadow.mapSize !== undefined) object.shadow.mapSize.fromArray(json.shadow.mapSize);
                if (json.shadow.camera !== undefined) object.shadow.camera = this.parseObject(json.shadow.camera);

            }

            if (json.visible !== undefined) object.visible = json.visible;
            if (json.frustumCulled !== undefined) object.frustumCulled = json.frustumCulled;
            if (json.renderOrder !== undefined) object.renderOrder = json.renderOrder;
            if (json.userjson !== undefined) object.userjson = json.userData;
            if (json.layers !== undefined) object.layers.mask = json.layers;

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
            let intensity_controller = this.folder.add(this.object, "intensity")
                .min(0).step(0.01).name("intensity (cd)");
            intensity_controller.onChange(() => this.on_update());
            this.controllers.push(intensity_controller);
            if (this.object.castShadow !== undefined) {
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
            if (this.object.distance !== undefined) {
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

    set_property(property, value, target_path) {
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
            this.set_property_chain(property, value, target_path);
        }
        if (this.object.isBackground) {
            // If we've set values on the Background, we need to fire its on_update()).
            this.on_update();
        }
        this.vis_controller.updateDisplay();
        this.controllers.forEach(c => c.updateDisplay());
    }

    set_property_chain(property, value, target_path) {
        // Break the property `obj0.obj1[obj2].foo` into the list
        // `[obj0, obj1, obj2]` and the property name `foo`.

        // Array [x] becomes .x.
        property = property.replace(/\[(\w+)\]/g, '.$1');
        // Strip a leading dot.
        property = property.replace(/^\./, '');
        var objects = property.split(".");
        const final_property = objects.pop();

        // Traverse the object sequence.

        // For loop invariant: `parent` starts as an object (by construction)
        // the for loop only updates it to another object.
        var error_detail = null;
        var parent = this.object;
        var parent_path = this.folder.name;
        for (const child of objects) {
            // Loop invariant: parent is object implies this test is always safe.
            if (child in parent) {
                parent_path += "." + child;
                if (typeof parent[child] === 'object') {
                    parent = parent[child];
                    continue;
                }
                error_detail = `'${parent_path}' is not an Object and has no properties`;
            } else {
                error_detail = `'${parent_path}' has no property '${child}'`;
            }
            break;
        }

        // Now assign the final property value (if possible). (We know that
        // parent is an object.)

        if (error_detail === null && !(final_property in parent)) {
            error_detail = `'${parent_path}' has no property '${final_property}'`;
        }

        if (error_detail != null) {
            // Note: full_path may not be an exact reproduction of the path
            // passed via msgpack.
            const full_path = "/" + target_path.join('/');
            const value_str = JSON.stringify(value);
            console.error(
                `Error in set_property("${full_path}", "${property}", ${value_str})\n` +
                `${error_detail}. The value will not be set.`);
            return;
        }

        parent[final_property] = value;
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
    link.onclick = function (e) {
        let scope = this;
        setTimeout(function () {
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
        recording_folder.add({ format: "png" }, "format", ["png", "jpg"]).onChange(value => {
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

    // When we are using an orthographic camera, we can't use environment
    // mapping. It must be UVMapping so it covers the screen.
    let mapping = is_perspective ? THREE.EquirectangularReflectionMapping :
        THREE.UVMapping;
    let texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat,
        THREE.UnsignedByteType, mapping,
        THREE.RepeatWrapping, THREE.ClampToEdgeWrapping,
        THREE.LinearFilter, THREE.LinearFilter, 1,
        THREE.SRGBColorSpace);
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
    return texture;
}

function load_env_texture(path, background, scene, is_visible, is_perspective) {
    // let has_error = false;
    let texture = new THREE.TextureLoader().load(path, undefined, undefined, () => {
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

// Utility function for waiting on the definition of an DOM element's child
// property. Given the element object and the name of the child property
// it will detect when it is *not* null and satisfies the given predicate.
// E.g., we can use this to wait until the value this.xr_button.textContent
// has been initialized by three.js. target_node = this.xr_button,
// property = "textContent", and the predicate tests for non-zero length.
function wait_for_property(target_node, property, predicate) {
    return new Promise(resolve => {
        const callback = () => {
            // We won't test the observes mutation, we'll simply use the fact
            // of the mutation to test the desired property directly.
            var prop_object = target_node[property];
            if (prop_object != null && predicate(prop_object)) {
                observer.disconnect();
                resolve();
            }
        };

        const observer = new MutationObserver(callback);
        observer.observe(target_node, { childList: true });

        // Just in case we have a race condition and it changed between the
        // invocation of this function and the dispatch of the observer.
        var prop_object = target_node[property];
        if (prop_object != null && predicate(prop_object)) {
            observer.disconnect();
            return resolve();
        }
    });
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
