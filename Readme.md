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
                Set the 3D object at a given path in the scene tree from its JSON description. 
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
                Set the homogeneous transform for a given path in the scene tree. An object's pose is the concatenation of all of the transforms along its path, so setting the transform of <code>"/foo"</code> will move the objects at <code>"/foo/box1"</code> and <code>"/foo/robots/hal9000"</code>. 
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
