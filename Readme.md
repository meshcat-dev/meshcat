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
        Handle a single command and update the viewer. <code>cmd</code> should be a JS object with at least the field <code>type</code>. Available command types are:
        <dl>
            <dt><code>set_object</code></dt>
            <dd>
                Set the 3D object at a given path in the scene tree from its JSON description. Any transforms previously applied to that path will be preserved and any children of that path will continue to exist. To remove transforms and delete all children from a given path, you should send a <code>delete</code> command first (see below).
                <p>Internally, we append a final path segment, <code>&lt;object&gt;</code>, to the provided path before creating the object. This is done because clients may disagree about what the "intrinsic" transform of a particular geometry is (for example, is a "Box" centered on the origin, or does it have one corner at the origin?). Clients can use the <code>matrix</code> field of the JSON object to store that intrinsic transform, and that matrix will be preserved by attaching it to the <code>&lt;object&gt;</code> path. Generally, you shouldn't need to worry about this: if you set an object at the path <code>/meshcat/foo</code>, then you can set the transform at <code>/meshcat/foo</code> and everything will just work.
                <p>Additional fields:</p>
                <dl>
                    <dt><code>path</code></dt>
                    <dd>A <code>"/"</code>-separated string indicating the object's path in the scene tree. An object at path <code>"/foo/bar"</code> is a child of an object at path <code>"/foo"</code>, so setting the transform of (or deleting) <code>"/foo"</code> will also affect its children.
                    <dt><code>object</code></dt>
                    <dd>The Three.js Object, with its geometry and material, in JSON form as a JS object. The format accepted is, essentially, anything that <a href="https://threejs.org/docs/#api/loaders/ObjectLoader">ObjectLoader</a> can handle, or, similarly, anything you might get by calling the <code>toJSON()</code> method of a Three.js Object3D.
                </dl>
                Example:
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
                Set a single named property of the object at the given path. If no object exists at that path, an empty one is automatically created.
                <p>Note: as we append an extra path element with the name <code>&lt;object&gt;</code> to every item created with <code>set_object</code>, if you want to modify a property of the object itself, rather than the group containing it, you should ensure that your path is of the form <code>/meshcat/foo/&lt;object&gt;</code></p>
                <p>Additional fields:</p>
                <dl>
                    <dt><code>property</code></dt>
                    <dd>The name of the property to set, as a string.</dd>
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
        </dl>
    </dd>
</dl>

### WebSocket API

<dl>
    <dt><code>Viewer.connect(url)</code></dt>
    <dd>
        Set up a web socket connection to a server at the given URL. The viewer will listen for messages on the socket as binary MsgPack blobs. Each message will be decoded using <code>msgpack.decode()</code> from <a href="https://github.com/kawanet/msgpack-lite">msgpack-lite</a> and the resulting object will be passed directly to <code>Viewer.handle_command()</code> as documented above.
        <p>
        Note that we do support the MsgPack extension types listed in <a href="https://github.com/kawanet/msgpack-lite#extension-types">msgpack-lite#extension-types</a>, and the <code>Float32Array</code> type is particularly useful for efficiently sending point data.
    </dd>
</dl>

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
</dl>

### Camera Control

The camera is just another object in the MeshCat scene, so you can move it around with <code>set_transform</code> commands like any other object. Please note that replacing the camera with <code>set_object</code> is not currently supported (but we expect to implement this in the future).

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

1. Install [yarn](https://yarnpkg.com/en/docs/install). This should also install `node` and `npm`. Try running `yarn -v` and `npm -v` to make sure those programs are installed.
2. Run `yarn`
    * This will read the `project.json` file and install all the necessary javascript dependencies.
3. Run `npm run build`
    * This will run webpack and create the bundled output in `dist/main.min.js`. The build script will also watch for changes to the MeshCat source files and regenerate the bundle whenever those source files change.
4. Try it out! You can load the bundled `main.min.js` in your own application, or you can open up `dist/index.html` in your browser.

Note that due to caching, you may need to do a hard refresh (shift+F5 or ctrl+shift+R) in your browser to reload the updated javascript bundle.
