# MeshCat

MeshCat is a remotely-controllable 3D viewer, built on top of [three.js](https://threejs.org/). The MeshCat viewer runs in a browser and listens for geometry commands over WebSockets. This makes it easy to create a tree of objects and transformations by sending the appropriate commands over the websocket.

The MeshCat viewer is meant to be combined with an interface in the language of your choice. Current interfaces are:

* [meshcat-python (Python 2.7 and 3.4+)](https://github.com/rdeits/meshcat-python)
* [MeshCat.jl (Julia)](https://github.com/rdeits/MeshCat.jl)

## API

MeshCat can be used programmatically from JS or over a WebSocket connection.

### Programmatic API

To create a new MeshCat viewer, use the `Viewer` constructor:

```js
let viewer = new MeshCat.Viewer(dom_element);
```

where `dom_element` is the `div` in which the viewer should live. The primary interface to the viewer is the `handle_command` function, which maps directly to the behaviors available over the WebSocket.

<dl>
    <dt><code>Viewer.handle_command(cmd)</code></dt>
    <dd>
        <p>Handle a single command and update the viewer. <code>cmd</code> should be a JS object with at least the field <code>type</code>.</p>
        <p><strong>Path model (applies to every command that takes a <code>path</code>):</strong> MeshCat uses a two-layer node model: a "container" node and a "renderable" node. Typical user paths (e.g., <code>/meshcat/foo</code>) refer to container nodes. When present (see <code>set_object()</code>), the corresponding renderable node is at <code>/meshcat/foo/&lt;object&gt;</code>. The container node services hierarchical operations (e.g., transformations, visibility, etc.). The renderable node contains the concrete 3D object and its intrinsic properties. This separation preserves the distinction between container-level transforms and the object's intrinsic frame (for example, geometry-local pose encoded in the object's <code>matrix</code>).</p>
        <p>In every command that takes a path, following that path creates any missing container nodes along the path. Automatically-created nodes will not necessarily produce visible artifacts; default placeholder nodes have no visible features. A renderable node is created when a command explicitly targets <code>.../&lt;object&gt;</code>, or when <code>set_object()</code> is called on a container path (equivalently, on that path with a trailing <code>/&lt;object&gt;</code>).</p>
        <p>Available command types are:</p>
        <dl>
            <dt><code>set_object</code></dt>
            <dd>
                Set (or replace) the renderable object associated with the container node named by <code>path</code> using the provided JSON description. Any transforms previously applied at that container path are preserved, and existing children of that container remain. To remove transforms and delete children first, send a <code>delete</code> command on that path (see below).
                <p>The object will be assigned to the renderable node associated with the path. As such, the two paths <code>/foo/bar</code> and <code>/foo/bar/&lt;object&gt;</code> are equivalent. By convention, use the container form (<code>/foo/bar</code>) when calling <code>set_object</code>.</p>
                <p>Additional fields:</p>
                <dl>
                    <dt><code>path</code></dt>
                    <dd>A <code>"/"</code>-delimited string indicating the container path in the scene tree (for example, <code>"/foo/bar"</code>). The form <code>"/foo/bar/&lt;object&gt;"</code> is also accepted and treated identically. A container at path <code>"/foo/bar"</code> is a child of a container at path <code>"/foo"</code>, so setting the transform of (or deleting) <code>"/foo"</code> also affects its descendants.
                    <dt><code>object</code></dt>
                    <dd>The Three.js Object, with its geometry and material, in JSON form as a JS object. The nominal format accepted is anything that <a href="https://threejs.org/docs/#api/loaders/ObjectLoader">ObjectLoader</a> can handle (i.e., anything you might get by calling the <code>toJSON()</code> method of a Three.js Object3D).
                    <p>Beyond the nominal format, Meshcat also offers a few extensions for convenience:
                    <ul>
                    <li>Within the <code>geometries</code> stanza, the <code>type</code> field can be set to <code>"_meshfile_geometry"</code> to parse using a mesh file format. In this case, the geometry must also have a field named <code>format</code> set to one of <code>"obj"</code> or <code>"dae"</code> or <code>"stl"</code> and a field named <code>"data"</code> with the string contents of the file.
                    <li>Within the <code>geometries</code> stanza, the <code>type</code> field can be set to <code>"LineGeometry"</code> to create lines with configurable width (works in all modern browsers). See the Line2 example below for details.
                    <li>Within the <code>materials</code> stanza, the <code>type</code> field can be set to <code>"_text"</code> to use a string as the texture (i.e., a font rendered onto an image). In this case, the material must also have fields named <code>font_size</code> (in pixels), <code>font_face</code> (a string), and <code>text</code> (the words to render into a texture).
                    <li>Within the <code>materials</code> stanza, the <code>type</code> field can be set to <code>"LineMaterial"</code> to create materials for Line2 objects with configurable line width. See the Line2 example below for details.
                    <li>Within the inner <code>object</code> stanza (i.e., the object with a uuid, not the object argument to set_object), the <code>type</code> field can be set to <code>"_meshfile_object"</code> to parse using a mesh file format. In this case, the <code>geometries</code> and <code>materials</code> and <code>geometry: {uuid}</code> and <code>material: {uuid}</code> are all ignored, and the object must have a field named <code>format</code> set to one of <code>"obj"</code> or <code>"dae"</code> or <code>"stl"</code> and a field named <code>"data"</code> with the string contents of the file. When the format is obj, the object may also have a field named <code>mtl_library</code> with the string contents of the associated mtl file.
                    <li>Within the inner <code>object</code> stanza, the <code>type</code> field can be set to <code>"Line2"</code> to render lines with configurable width using LineGeometry and LineMaterial. See the Line2 example below for details.
                    </ul>
                </dl>
                <p>Example (nominal format):
                <pre>
{
    type: "set_object",
    path: "/meshcat/boxes/box1",
    object: {
        metadata: {version: 4.5, type: "Object"},
        geometries: [
            {
                uuid: "cef79e52-526d-4263-b595-04fa2705974e",
                type: "BoxGeometry",
                width: 1,
                height: 1,
                depth:1
            }
        ],
        materials: [
            {
                uuid: "0767ae32-eb34-450c-b65f-3ae57a1102c3",
                type: "MeshLambertMaterial",
                color: 16777215,
                emissive: 0,
                side: 2,
                depthFunc: 3,
                depthTest: true,
                depthWrite: true
            }
        ],
        object: {
            uuid: "00c2baef-9600-4c6b-b88d-7e82c40e004f",
            type: "Mesh",
            geometry: "cef79e52-526d-4263-b595-04fa2705974e",
            material: "0767ae32-eb34-450c-b65f-3ae57a1102c3"
        }
    }
}
                </pre>
                Note the somewhat indirect way in which geometries and materials are specified. Each Three.js serialized object has a list of geometries and a list of materials, each with a UUID. The actual geometry and material for a given object are simply references to those existing UUIDs. This enables easy re-use of geometries between objects in Three.js, although we don't really rely on that in MeshCat. Some information about the JSON object format can be found on the <a href="https://github.com/mrdoob/three.js/wiki/JSON-Object-Scene-format-4">Three.js wiki</a>.
                <p>
                <p>Example (<code>_meshfile_geometry</code>):
                <pre>
{
    type: "set_object",
    path: "/some/file/geometry",
    object: {
        metadata: {
            version: 4.5,
            type: "Object"
        },
        geometries: [
            {
                type: "_meshfile_geometry",
                uuid: "4a08da6b-bbc6-11ee-b7a2-4b79088b524d",
                format: "obj",
                data: "v -0.06470900 ..."
            }
        ],
        images: [
            {
                uuid: "c448fc3a-bbc6-11ee-b7a2-4b79088b524d",
                url: "data:image/png;base64,iVBORw0KGgoAAA=="
            }
        ],
        textures: [
            {
                uuid: "d442ea92-bbc6-11ee-b7a2-4b79088b524d",
                wrap: [1001, 1001],
                repeat: [1, 1],
                image: "c448fc3a-bbc6-11ee-b7a2-4b79088b524d"
            }
        ],
        materials: [
            {
                uuid: "4a08da6e-bbc6-11ee-b7a2-4b79088b524d",
                type: "MeshLambertMaterial",
                color: 16777215,
                reflectivity: 0.5,
                map: "d442ea92-bbc6-11ee-b7a2-4b79088b524d"
            }
        ],
        object: {
            uuid: "4a08da6f-bbc6-11ee-b7a2-4b79088b524d",
            type: "Mesh",
            geometry: "4a08da6b-bbc6-11ee-b7a2-4b79088b524d",
            material: "4a08da6e-bbc6-11ee-b7a2-4b79088b524d"
        }
    }
}
                </pre>
                <p>Example (<code>_text</code>):
                <pre>
{
    type: "set_object",
    path: "/meshcat/text",
    object: {
        metadata: {
            version: 4.5,
            type: "Object"
        },
        geometries: [
            {
                uuid: "6fe70119-bba7-11ee-b7a2-4b79088b524d",
                type: "PlaneGeometry",
                width: 8,
                height: 8,
                widthSegments: 1,
                heightSegments: 1
            }
        ],
        textures: [
            {
                uuid: "0c8c99a8-bba8-11ee-b7a2-4b79088b524d",
                type: "_text",
                text: "Hello, world!",
                font_size: 300,
                font_face: "sans-serif"
            }
        ],
        materials: [
            {
                uuid: "6fe7011b-bba7-11ee-b7a2-4b79088b524d",
                type: "MeshPhongMaterial",
                transparent: true,
                map: "0c8c99a8-bba8-11ee-b7a2-4b79088b524d",
            }
        ],
        object: {
            uuid: "6fe7011c-bba7-11ee-b7a2-4b79088b524d",
            type: "Mesh",
            geometry: "6fe70119-bba7-11ee-b7a2-4b79088b524d",
            material: "6fe7011b-bba7-11ee-b7a2-4b79088b524d",
        }
    }
}
                </pre>
                <p>Example (<code>_meshfile_object</code>):
                <pre>
{
    type: "set_object",
    path: "/meshcat/wavefront_file",
    object: {
        metadata: {version: 4.5, type: "Object"},
        object: {
            uuid: "00c2baef-9600-4c6b-b88d-7e82c40e004f",
            type: "_meshfile_object",
            format: "obj",
            data: "mtllib ./cube.mtl\nusemtl material_0\nv 0.0 0.0 0.0 ...",
            mtl_library: "newmtl material_0\nKa 0.2 0.2 0.2\n ...",
            resources: {"cube.png": "data:image/png;base64,iV ..."}
        }
    }
}
                </pre>
                <p>Check <code>test/meshfile_object_obj.html</code> for the full demo.</p>
                <p>Example (Line2 with <code>LineGeometry</code> and <code>LineMaterial</code>):</p>
                <p>Modern browsers don't support the GL_LINEWIDTH parameter, so standard Line objects won't show varying line widths. MeshCat supports Line2 objects with LineGeometry and LineMaterial for lines with configurable properties.</p>
                <pre>
{
    type: "set_object",
    path: "/meshcat/fatline",
    object: {
        metadata: {version: 4.5, type: "Object"},
        geometries: [
            {
                uuid: "6fe70119-bba7-11ee-b7a2-4b79088b524d",
                type: "LineGeometry",
                position: {
                    array: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0])
                },
                color: {
                    array: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
                }
            }
        ],
        materials: [
            {
                uuid: "6fe7011b-bba7-11ee-b7a2-4b79088b524d",
                type: "LineMaterial",
                color: 16777215,
                linewidth: 5.0,
                vertexColors: true,
                dashed: false,
                worldUnits: false
            }
        ],
        object: {
            uuid: "6fe7011c-bba7-11ee-b7a2-4b79088b524d",
            type: "Line2",
            geometry: "6fe70119-bba7-11ee-b7a2-4b79088b524d",
            material: "6fe7011b-bba7-11ee-b7a2-4b79088b524d"
        }
    }
}
                </pre>
                <p>LineGeometry supports these attributes:</p>
                <ul>
                <li><code>position</code>: Float32Array of vertex positions (x, y, z, x, y, z, ...)
                <li><code>color</code>: (optional) Float32Array of per-vertex RGB colors (r, g, b, r, g, b, ...)
                </ul>
                <p>LineMaterial supports the exact same attributes as documented in the <a href="https://threejs.org/docs/#examples/en/lines/LineMaterial">Three.js LineMaterial docs</a>.</p>
                <p>Check <code>test/fatlines.html</code> for a full demo.</p>
            </dd>
            <dt><code>set_transform</code></dt>
            <dd>
                Set the homogeneous transform for a given path in the scene tree. An object's pose is the concatenation of all of the transforms along its path, so setting the transform of <code>"/foo"</code> will move the objects at <code>"/foo/box1"</code> and <code>"/foo/robots/HAL9000"</code>.
                <p>Additional fields:</p>
                <dl>
                    <dt><code>path</code></dt>
                    <dd>A <code>"/"</code>-separated string indicating the object's path in the scene tree. An object at path <code>"/foo/bar"</code> is a child of an object at path <code>"/foo"</code>, so setting the transform of (or deleting) <code>"/foo"</code> will also affect its children.
                    <dt><code>matrix</code></dt>
                    <dd>
                        The homogeneous transformation matrix, given as a 16-element <code>Float32Array</code> in column-major order.
                    </dd>
                </dl>
                Example:
                <pre>
{
    type: "set_transform",
    path: "/meshcat/boxes",
    matrix: new Float32Array([1, 0, 0, 0,
                            0, 1, 0, 0,
                            0, 0, 1, 0,
                            0.5, 0.0, 0.5, 1])
}
                </pre>
            </dd>
            <dt><code>delete</code></dt>
            <dd>
                Delete the object at the given path as well as all of its children.
                <p>Additional fields:</p>
                <dl>
                    <dt><code>path</code></dt>
                    <dd>A <code>"/"</code>-separated string indicating the object's path in the scene tree. An object at path <code>"/foo/bar"</code> is a child of an object at path <code>"/foo"</code>, so setting the transform of (or deleting) <code>"/foo"</code> will also affect its children.
                </dl>
                Example:
                <pre>
{
    type: "delete",
    path: "/meshcat/boxes"
}
                </pre>
            </dd>
            <dt><code>set_property</code></dt>
            <dd>
                Set a single named property at the given path.
                If no node exists at that path, missing container nodes are created automatically.
                <p>Under the two-layer path model, use a container path (for example, <code>/meshcat/foo</code>) for container-level operations, and use <code>/meshcat/foo/&lt;object&gt;</code> for properties on the renderable object itself.</p>
                <p>Additional fields:</p>
                <dl>
                    <dt><code>property</code></dt>
                    <dd>
                        <p>The property name to set, as a string.</p>
                        <p><strong>Property categories</strong></p>
                        <p>
                        MeshCat supports three categories for <code>property</code>:
                        </p>
                        <ul>
                            <li><strong>Convenience properties</strong> are short aliases for assigning values to standard scene-graph properties.
                            <li><strong>Custom properties</strong> are Meshcat-specific properties that enable custom behavior and are not part of three.js.
                            <li><strong>Literal properties</strong> are interpreted as literal javascript properties of the object named by the path. The property could be a direct property of the named object (e.g., "type"), or a "chained" property (e.g., "material.map.repeat.x").
                        </ul>
                        <p>The following names are <strong>convenience properties</strong>:</p>
                        <ul>
                            <li><code>visible: bool</code>
                            <li><code>position: number[3]</code>
                            <li><code>quaternion: number[4]</code>
                            <li><code>scale: number[3]</code>
                            <li><code>color: number[4]</code>
                            <li><code>opacity: number</code> (this is the same as the 4th element of <code>color</code>)
                            <li><code>modulated_opacity: number</code>
                            <li><code>top_color: number[3]</code> (only for the Background)
                            <li><code>bottom_color: number[3]</code> (only for the Background)
                        </ul>
                        <p>The following are Meshcat's <strong>custom</strong> behaviors and their corresponding properties:</p>
                        <ul>
                            <li>
                                <strong>Texture crawl</strong>.
                                MeshCat provides a feature that will cause the texture on an object to appear to "crawl" along the surface (useful for visualizing tank treads or conveyor belts). The textures are displaced across the surface of the geometry by rotating around a "crawl" axis. By repeatedly updating the displacement amount with respect to time, the texture will appear to crawl around the object.
                                <p>The properties are:</p>
                                <ul>
                                    <li><code>crawl_axis</code> a direction, specified in the <strong>geometry</strong> frame (thereby moving with the geometry).</li>
                                    <li><code>crawl_displacement</code> is a distance measure (world-frame scalar distance) indicating the amount the texture should be displaced.</li>
                                </ul>
                                <p>The object(s) must have texture coordinates and texture(s) applied.</p>
                                <p>The "geometry frame" refers to the <strong>container</strong> frame as this typically contains the pose for the geometry as defined by the external application. For example, when setting <code>crawl_axis</code> on <code>/meshcat/textured_mesh</code>, the axis is expressed in the frame of <code>/meshcat/textured_mesh</code>. As such, this propery (like e.g., <code>position</code> or <code>quaternion</code>) is a <strong>container</strong> property.</p>
                                <p><strong>Limitations:</strong> Crawling textures only produce physically meaningful results on geometries whose UV layout is compatible with uniform translation. Specifically, the texture must tile seamlessly (using <code>RepeatWrapping</code>) and the UV parameterization must be laid out so that a constant UV offset corresponds to a coherent physical slide across the surface in the crawl direction. Geometries with UV seams, strong UV distortion (e.g., poles of a sphere), or UV atlases where adjacent surface regions map to disjoint parts of the texture image will exhibit tiling artifacts or discontinuous motion. Flat or gently-curved surfaces textured with a uniformly tiling pattern (such as a box or plane with a repeating texture) are the typical well-behaved use case.</p>
                            </li>
                        </ul>
                        <p>Any property name not listed in the convenience or custom properties is evaluated as a literal property on the target object. Chained names (e.g., <code>material.shininess</code>), and are resolved left-to-right so the final name in the chain receives <code>value</code>.</p>
                        <p><strong>Timing and replay semantics</strong></p>
                        <ul>
                        <li>Referencing missing nodes in the <code>path</code> will create those missing nodes. In contrast, naming a missing property does not create that property.
                        <li>If the property name is an <strong>invalid</strong> chained property that cannot be resolved, Meshcat writes an error to the console and does not assign the value. The chained property cannot be resolved when a named component in the chain is missing or if a named component's property is referenced, but the component has no properties itself.
                        <li>Property chains can include array indexing syntax such as <code>children[1].material.specular</code>. In error messages, this may appear as <code>children.1</code>.</li>
                        <li>Calling set_property() before calling set_object() on the same path should generally be considered an error. Unless you are setting a property on a container node, the property will most likely have no effect.
                        </ul>
                    </dd>
                    <dt><code>value</code></dt>
                    <dd>The new value.</dd>
                </dl>
                Example 1:
                <pre>
{
    type: "set_property",
    path: "/Cameras/default/rotated/&lt;object&gt;",
    property: "zoom",
    value: 2.0
}
                </pre>
                Example 2:
                <pre>
{
    type: "set_property",
    path: "/Lights/DirectionalLight/&lt;object&gt;",
    property: "intensity",
    value: 1.0
}
                </pre>
                Example 3 (chained properties):
                <pre>
{
    type: "set_property",
    path: "/Lights/SpotLight/&lt;object&gt;",
    property: "shadow.radius",
    value: 1.0
}
                </pre>
                Example 4 (crawling texture):
                <pre>
{
    type: "set_property",
    path: "/meshcat/textured_mesh",
    property: "crawl_axis",
    value: [1.0, 0.0, 0.0]
}
{
    type: "set_property",
    path: "/meshcat/textured_mesh",
    property: "crawl_displacement",
    value: 0.125
}
                </pre>
            </dd>
            <dt><code>set_animation</code></dt>
            <dd>
                Create an animation of any number of properties on any number of objects in the scene tree, and optionally start playing that animation.
                <p>Additional fields:</p>
                <dl>
                    <dt><code>animations</code></dt>
                    <dd>
                        A list of objects, each with two fields:
                        <dl>
                            <dt><code>path</code></dt>
                            <dd>
                                The path to the object whose property is begin animated. As with <code>set_property</code> above, you will need to append <code>&lt;object&gt;</code> to the path to set an object's intrinsic property.
                            </dd>
                            <dt><code>clip</code></dt>
                            <dd>
                                A Three.js <code>AnimationClip</code> in JSON form. The clip in turn has the following fields:
                                <dl>
                                    <dt><code>fps</code></dt>
                                    <dd>
                                        The frame rate of the clip
                                    </dd>
                                    <dt><code>name</code></dt>
                                    <dd>
                                        A name for this clip. Not currently used.
                                    </dd>
                                    <dt><code>tracks</code></dt>
                                    <dd>
                                        The tracks (i.e. the properties to animate for this particular object. In Three.js, it is possible for a track to specify the name of the object it is attached to, and Three.js will automatically perform a depth-first search for a child object with that name. We choose to ignore that feature, since MeshCat already has unambiguous paths. So each track should just specify a property in its <code>name</code> field, with a single <code>"."</code> before that property name to signify that it applies to exactly the object given by the <code>path</code> above.
                                        <p>Each track has the following fields:</p>
                                        <dl>
                                            <dt><code>name</code></dt>
                                            <dd>
                                                The property to be animated, with a leading <code>"."</code> (e.g. <code>".position"</code>)
                                            </dd>
                                            <dt><code>type</code></dt>
                                            <dd>
                                                The Three.js data type of the property being animated (e.g. <code>"vector3"</code> for the <code>position</code> property)
                                            </dd>
                                            <dt><code>keys</code></dt>
                                            <dd>
                                                The keyframes of the animation. The format is a list of objects, each with a field <code>time</code> (in frames) and <code>value</code> indicating the value of the animated property at that time.
                                            </dd>
                                        </dl>
                                    </dd>
                                </dl>
                            </dd>
                        </dl>
                    </dd>
                    <dt><code>options</code></dt>
                    <dd>
                        Additional options controlling the animation. Currently supported values are:
                        <dl>
                            <dt><code>play</code></dt>
                            <dd>Boolean [true]. Controls whether the animation should play immediately.</dd>
                            <dt><code>repetitions</code></dt>
                            <dd>Integer [1]. Controls the number of repetitions of the animation each time you play it.</dd>
                        </dl>
                    </dd>
                </dl>
                Example:
                <pre>
{
    type: "set_animation",
    animations: [{
            path: "/Cameras/default",
            clip: {
                fps: 30,
                name: "default",
                tracks: [{
                    name: ".position"
                    type: "vector3",
                    keys: [{
                        time: 0,
                        value: [0, 1, .3]
                    },{
                        time: 80,
                        value: [0, 1, 2]
                    }],
                }]
            }
        },{
            path: "/meshcat/boxes",
            clip: {
                fps: 30,
                name: "default",
                tracks: [{
                    name: ".position"
                    type: "vector3",
                    keys: [{
                        time: 0,
                        value: [0, 1, 0]
                    },{
                        time: 80,
                        value: [0, -1, 0]
                    }],
                }]
            }
        }],
    options: {
        play: true,
        repetitions: 1
    }
}
                </pre>
            </dd>
            <dt><code>set_target</code></dt>
            <dd>
                Set the target of the 3D camera, around which it rotates. This is expressed in a left-handed coordinate system where <emph>y</emph> is up.  
                <p>Example:</p>
                <pre>
{
    "type": "set_target",
    value: [0., 1., 0.]
}
                </pre>
                This sets the camera target to `(0, 1, 0)`
            </dd>
            <dt><code>capture_image</code></dt>
            <dd>
                Capture an image from the viewport. At the moment it will return the image at a provided resolution (by default 1920x1080).
                <pre>
{
    "type": "capture_image",
    "xres": 1920,
    "yres": 1080
}
                </pre>
                This sets the camera target to `(0, 1, 0)`
            </dd>
            <dt><code>set_render_callback</code></dt>
            <dd>
                Each render loop updates the camera, renders the scene and updates
                animation. Between updating the camera and rendering the scene,
                the Viewer invokes a user-configurable callback. This callback
                can be used to execute arbitrary code per rendered frame.
                <br><br>
                The callback is evaluated in a scope such that the Viewer
                instance is available as `this`. In declaring the
                command, the callback should be a *string* that gets evaluated
                into a function. Passing the string "null" will restore the
                render callback to being its default no-op function.
                <br><br>
                For example, the following is an example callback that dispatches
                the camera's pose in the world to the open websocket connection.
            <pre>
{
    "type": "set_render_callback",
    "callback": `() => {
        if (this.is_perspective()) {
            if (this.connection.readyState == 1 /* OPEN */) {
                this.connection.send(msgpack.encode({
                    'type': 'camera_pose',
                    'camera_pose': this.camera.matrixWorld.elements
                }));
            }
        }
    }`
}
            </pre>
            This dispatches the camera's pose in the world to the websocket
            connection.
            </dd>
        </dl>
    </dd>
</dl>

### WebSocket API

<dl>
    <dt><code>Viewer.connect(url)</code></dt>
    <dd>
        Set up a web socket connection to a server at the given URL. The viewer will listen for messages on the socket as binary MsgPack blobs. Each message will be decoded using <code>msgpack.decode()</code> from <a href="https://github.com/msgpack/msgpack-javascript">msgpack-javascript</a> and the resulting object will be passed directly to <code>Viewer.handle_command()</code> as documented above.
        <p>
        Note that we do support the MsgPack extension types listed in <a href="https://github.com/msgpack/msgpack-javascript#extension-types">msgpack-javascript#extension-types</a>, with additional support for the <code>Float32Array</code> type which is particularly useful for efficiently sending point data and for <code>Uint32Array</code>, <code>Uint8Array</code>, and <code>Int32Array</code>.
    </dd>
</dl>

### Setting opacity

Objects can have their opacity changed in the obvious way, i.e.:

<pre>
{
    type: "set_property",
    path: "/path/to/my/geometry",
    property: "opacity",
    value: 0.5
}
</pre>

This would assign the opacity value 0.5 to *all* of the materials found rooted
at `"/path/to/my/geometry"`. (That means using the path `"/path"` could affect
many geometries.) However, this will overwrite whatever opacity the geometry had
inherently (i.e., from the material defined in the mesh file); a transparent
object could become *more* opaque.

Meshcat offers a pseudo property "modulated_opacity". Meshcat remembers an
object's inherent opacity and, by setting *this* value, sets the rendered
opacity to be the product of the inherent and modulated opacity value. The
corresponding command would be:

<pre>
{
    type: "set_property",
    path: "/path/to/my/geometry",
    property: "modulated_opacity",
    value: 0.5
}
</pre>

Setting `"modulated_opacity"` to 1 will restore the geometry's original
opacity. This does *not* introduce a queryable `modulated_opacity` property on
any material. This is what makes it a "pseudo" property. The same tree-based
scope of effect applies to `"modulated_opacity"` as with `"opacity"` (and also
the `"color"` property).

Meshcat *always* remembers the inherent opacity value. So, if you've overwritten
the value (via setting `"opacity"` or `"color"`), you can restore it by setting
the `"modulated_opacity"` value to 1.0.

### Useful Paths

The default MeshCat scene comes with a few objects at pre-set paths. You can replace, delete, or transform these objects just like anything else in the scene.

<dl>
    <dt><code>/Lights/DirectionalLight</code></dt>
    <dd>The single directional light in the scene.</dd>
    <dt><code>/Lights/AmbientLight</code></dt>
    <dd>The ambient light in the scene.</dd>
    <dt><code>/Grid</code></dt>
    <dd>The square grid in the x-y plane, with 0.5-unit spacing.</dd>
    <dt><code>/Axes</code></dt>
    <dd>The red, green, and blue XYZ triad at the origin of the scene (invisible by default, click on "open controls" in the upper right to toggle its visibility).</dd>
    <dt><code>/Cameras</code></dt>
    <dd>The camera from which the scene is rendered (see below for details)</dd>
    <dt><code>/Background</code></dt>
    <dd>The background texture, with properties for "top_color" and "bottom_color" as well as a boolean "visible".</dd>
    <dt><code>/Render Settings/&lt;object&gt;</code></dt>
    <dd>Contains properties for how the overall scene renders in your current session. This is not a 3D element in the scene, but provides parameters for configuring the renderer.</dd>
</dl>

### Camera Control

The camera is just another object in the MeshCat scene, so you can move it around with <code>set_transform</code> commands like any other object. You can also use <code>set_target</code> to change the camera's target. Please note that replacing the camera with <code>set_object</code> is not currently supported (but we expect to implement this in the future).

Controlling the camera is slightly more complicated than moving a single object because the camera actually has two important poses: the origin about which the camera orbits when you click-and-drag with the mouse, and the position of the camera itself. In addition, cameras and controls in Three.js assume a coordinate system in which the Y axis is upward. In robotics, we typically have the Z axis pointing up, and that's what's done in MeshCat. To account for this, the actual camera lives inside a few path elements:

`/Cameras/default/rotated/<object>`

The <code>/rotated</code> path element exists to remind users that its transform has been rotated to a Y-up coordinate system for the camera inside.

There is one additional complication: the built-in orbit and pan controls (which allow the user to move the view with their mouse) use the translation of *only* the intrinsic transform of the camera object itself to determine the radius of the orbit. That means that, in practice, you can allow the user to orbit by setting the `position` property at the path `/Cameras/default/rotated/<object>` to a nonzero value like `[2, 0, 0]`, or you can lock the orbit controls by setting the `position` property at that path to `[0, 0, 0]`. Remember that whatever translation you choose is in the *rotated*, Y-up coordinate system that the Three.js camera expects. We're sorry.

#### Examples

To move the camera's center of attention to the point `[1, 2, 3]`, while still allowing the user to orbit and pan manually, we suggest setting the transform of the `/Cameras/default` path to whatever center point you want and setting the `position` property of `/Cameras/default/rotated/<object>` to `[2, 0, 0]`. That means sending two commands:

```js
{
    type: "set_transform",
    path: "/Cameras/default",
    matrix: new Float32Array([1, 0, 0, 0,
                              0, 1, 0, 0,
                              0, 0, 1, 0,
                              1, 2, 3, 1])  // the translation here is the camera's
                                            // center of attention
},
{
    type: "set_property",
    path: "/Cameras/default/rotated/<object>",
    property: "position",
    value: [2, 0, 0] // the offset of the camera about its point of rotation
}
```

To move the camera itself to the point `[1, 2, 3]` and lock its controls, we suggest setting the transform of `/Cameras/default` to the exact camera pose and setting the `position` property of `/Cameras/default/rotated/<object>` to `[0, 0, 0]`:

```js
{
    type: "set_transform",
    path: "/Cameras/default",
    matrix: new Float32Array([1, 0, 0, 0,
                              0, 1, 0, 0,
                              0, 0, 1, 0,
                              1, 2, 3, 1])  // the translation here is now the camera's
                                            // exact pose
},
{
    type: "set_property",
    path: "/Cameras/default/rotated/<object>",
    property: "position",
    value: [0, 0, 0] // set to zero to lock the camera controls
}
```

## Developing MeshCat

The MeshCat javascript sources live in `src/index.js`. We use [webpack](https://webpack.js.org/) to bundle up MeshCat with its Three.js dependencies into a single javascript bundle. If you want to edit the MeshCat source, you'll need to regenerate that bundle. Fortunately, it's pretty easy:

### Option 1: Use Docker

If you have Docker + BuildKit installed, then you can run `rebuild/rebuild.sh`
to hermetically regenerate the `dist` files. The very first time you run it, it
might take a little time to download all of the relevant files. Subsequent runs
should be much faster (~5-10 seconds).

This option offers the easiest way to rebuild, with the drawback that "watch"
mode of webpack (to automatically rebuild every time you save) is unavailable.

To install Docker + BuildKit on Ubuntu, run:

```
sudo apt install docker.io docker-buildx
```

To run as non-root, you will probably also need to update the `docker` group
permissions:

https://docs.docker.com/engine/install/linux-postinstall/

### Option 2: Install Yarn + NPM tools

This option offers a convenient "watch" mode during an edit-test development
cycle, but if you're not careful when installing the yarn+node+npm tools you
might damage other software on your computer.

1. Install [yarn](https://yarnpkg.com/en/docs/install). This should also install `node` and `npm`. Try running `yarn -v` and `npm -v` to make sure those programs are installed.
2. Run `yarn`
    * This will read the `project.json` file and install all the necessary javascript dependencies.
3. Run `yarn build`
    * This will run webpack and create the bundled output in `dist/main.min.js`. The build script will also watch for changes to the MeshCat source files and regenerate the bundle whenever those source files change.
4. Try it out! You can load the bundled `main.min.js` in your own application, or you can open up `dist/index.html` in your browser.

Note that due to caching, you may need to do a hard refresh (shift+F5 or ctrl+shift+R) in your browser to reload the updated javascript bundle.
