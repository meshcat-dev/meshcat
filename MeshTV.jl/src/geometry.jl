module Geometry

using GeometryTypes
using CoordinateTransformations

using Colors: Colorant, RGB, alpha
using StaticArrays: StaticVector, SVector
using GeometryTypes: raw
using Parameters: @with_kw
using Base.Random: UUID, uuid1

import Base: length

export Mesh,
       MeshBasicMaterial,
       MeshLambertMaterial,
       MeshPhongMaterial,
       PngImage,
       Texture,
       lower,
       SetObject

const GeometryLike = Union{AbstractGeometry, AbstractMesh}
abstract type AbstractObject end
abstract type AbstractMaterial end


struct Mesh{G <: GeometryLike, M <: AbstractMaterial} <: AbstractObject
	geometry::G
	material::M
end

geometry(o::Mesh) = o.geometry
material(o::Mesh) = o.material

Base.convert(::Type{<:Mesh}, geometry::GeometryLike) = Mesh(geometry, MeshLambertMaterial())

struct PngImage
    data::Vector{UInt8}
end

PngImage(fname::AbstractString) = PngImage(open(read, fname))

@with_kw struct Texture
    image::PngImage
    wrap::Tuple{Int, Int} = (1001, 1001)  # TODO: replace with enum
    repeat::Tuple{Int, Int} = (1, 1)      # TODO: what does this mean?
end

@with_kw struct MeshMaterial <: AbstractMaterial
	_type::String
	color::Colorant = RGB(1., 1., 1.)   # not a concrete type, but probably not a major performance problem
    map::Union{Texture, Void} = nothing
end

MeshBasicMaterial(;kw...) = MeshMaterial(_type="MeshBasicMaterial"; kw...)
MeshLambertMaterial(;kw...) = MeshMaterial(_type="MeshLambertMaterial"; kw...)
MeshPhongMaterial(;kw...) = MeshMaterial(_type="MeshPhongMaterial"; kw...)

threejs_type(m::MeshMaterial) = m._type
threejs_type(o::Mesh) = "Mesh"


##### Taken from DrakeVisualizer/geometry_types.jl #####
# GeometryTypes doesn't define an Ellipsoid type yet, so we'll make one ourselves!
mutable struct HyperEllipsoid{N, T} <: GeometryPrimitive{N, T}
    center::Point{N, T}
    radii::Vec{N, T}
end

origin(geometry::HyperEllipsoid{N, T}) where {N, T} = geometry.center
radii(geometry::HyperEllipsoid{N, T}) where {N, T} = geometry.radii
center(geometry::HyperEllipsoid) = origin(geometry)

mutable struct HyperCylinder{N, T} <: GeometryPrimitive{N, T}
    length::T # along last axis
    radius::T
    # origin is at center
end

length(geometry::HyperCylinder) = geometry.length
radius(geometry::HyperCylinder) = geometry.radius
origin(geometry::HyperCylinder{N, T}) where {N, T} = zeros(SVector{N, T})
center(g::HyperCylinder) = origin(g)

center(geometry::HyperRectangle) = minimum(geometry) + 0.5 * widths(geometry)
center(geometry::HyperCube) = minimum(geometry) + 0.5 * widths(geometry)
center(geometry::HyperSphere) = origin(geometry)
############################################################


intrinsic_transform(g) = IdentityTransformation()
intrinsic_transform(g::HyperRectangle) = Translation(center(g)...)
intrinsic_transform(g::HyperSphere) = Translation(center(g)...)
intrinsic_transform(g::HyperEllipsoid) = Translation(center(g)...)
intrinsic_transform(g::HyperCylinder) = Translation(center(g)...)
intrinsic_transform(g::HyperCube) = Translation(center(g)...)


function lower(t::Transformation)
    H = [transform_deriv(t, Vec(0., 0, 0)) t(Vec(0., 0, 0));
     Vec(0, 0, 0, 1)']
    reshape(H, length(H))
end

function lower(obj::AbstractObject, uuid=uuid1())
	data = Dict{String, Any}(
	    "metadata" => Dict{String, Any}("version" => 4.5, "type" => "Object"),
        "object" => Dict{String, Any}(
            "uuid" => string(uuid),
            "type" => threejs_type(obj),
            "matrix" => lower(intrinsic_transform(geometry(obj))),
            "geometry" => lower(geometry(obj)),
            "material" => lower(material(obj))
        )
    )
    flatten!(data)
    data
end

function replace_with_uuid!(data, field, destination_data, destination_field)
    if field in keys(data)
        obj = data[field]
        data[field] = obj["uuid"]
        push!(get!(destination_data, destination_field, []), obj)
    end
end

function flatten!(object_data::Dict)
    replace_with_uuid!(object_data["object"], "geometry", object_data, "geometries")
    replace_with_uuid!(object_data["object"], "material", object_data, "materials")
    for material in get(object_data, "materials", [])
        replace_with_uuid!(material, "map", object_data, "textures")
    end
    for texture in get(object_data, "textures", [])
        replace_with_uuid!(texture, "image", object_data, "images")
    end
end

function lower(box::HyperRectangle{3}, uuid=uuid1())
    w = widths(box)
    Dict{String, Any}(
        "uuid" => string(uuid),
        "type" => "BoxGeometry",
        "width" => w[1],
        "height" => w[2],
        "depth" => w[3]
    )
end

js_array_type(::Type{Float32}) = "Float32Array"
js_array_type(::Type{UInt32}) = "Uint32Array"

struct PackedVector{V <: AbstractVector}  # TODO: should require contiguous layout
    data::V
end

function lower(points::Vector{P}) where {P <: Union{StaticVector, Colorant}}
    N = length(P)
    T = eltype(P)
    Dict{String, Any}(
        "itemSize" => N,
        "type" => js_array_type(T),
        "array" => PackedVector(reinterpret(T, points, (N * length(points),))),
    )
end

to_zero_index(f::Face{N}) where {N} = SVector(raw.(convert(Face{N, OffsetInteger{-1, UInt32}}, f)))

lower(faces::Vector{<:Face}) = lower(to_zero_index.(faces))

function lower(mesh::AbstractMesh, uuid=uuid1())
    attributes = Dict{String, Any}(
        "position" => lower(vertices(mesh))
    )
    if hastexturecoordinates(mesh)
        attributes["uv"] = lower(texturecoordinates(mesh))
    end
    Dict{String, Any}(
        "uuid" => string(uuid),
        "type" => "BufferGeometry",
        "data" => Dict{String, Any}(
            "attributes" => attributes,
            "index" => lower(faces(mesh))
        )
    )
end


function lower(material::MeshMaterial, uuid=uuid1())
    data = Dict{String, Any}(
        "uuid" => string(uuid),
        "type" => threejs_type(material),
        "color" => string("0x", hex(convert(RGB, material.color))),
        "transparent" => alpha(material.color) != 1,
        "opacity" => alpha(material.color),
    )
    if material.map !== nothing
        uuid = uuid1()
        data["map"] = lower(material.map)
    end
    data
end

function lower(t::Texture, uuid=uuid1())
    Dict{String, Any}(
        "uuid" => string(uuid),
        "image" => lower(t.image),
        "wrap" => t.wrap,
        "repeat" => t.repeat,
    )
end

function lower(img::PngImage, uuid=uuid1())
    Dict{String, Any}(
        "uuid" => string(uuid),
        "url" => string("data:image/png;base64,", base64encode(img.data))
    )
end

abstract type AbstractCommand end

struct SetObject{O <: AbstractObject} <: AbstractCommand
    object::O
    path::Vector{Symbol}
end

function lower(cmd::SetObject)
    Dict{String, Any}(
        "type" => "set_object",
        "object" => lower(cmd.object),
        "path" => string.(cmd.path)
    )
end




end
