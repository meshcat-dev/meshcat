module Geometry

using GeometryTypes
using Parameters: @with_kw
using Base.Random: UUID, uuid1
using Colors
using MsgPack

export Mesh,
       MeshBasicMaterial,
       MeshLambertMaterial,
       MeshPhongMaterial,
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


@with_kw struct MeshMaterial <: AbstractMaterial
	_type::String
	color::Colorant = RGBA(1., 1., 1., 1.)   # not a concrete type, but probably not a major performance problem
end

MeshBasicMaterial(kw...) = MeshMaterial(_type="MeshBasicMaterial", kw...)
MeshLambertMaterial(kw...) = MeshMaterial(_type="MeshLambertMaterial", kw...)
MeshPhongMaterial(kw...) = MeshMaterial(_type="MeshPhongMaterial", kw...)

threejstype(m::MeshMaterial) = m._type
threejstype(o::Mesh) = "Mesh"


function serialize(obj::AbstractObject, uuid=uuid1())
	data = Dict{String, Any}(
	    "metadata" => Dict{String, Any}("version" => 4.5, "type" => "Object"),
        "object" => Dict{String, Any}(
            "uuid" => string(uuid),
            "type" => threejstype(obj),
        )
    )
    add_to_object!(data, geometry(obj))
    add_to_object!(data, material(obj))
    data
end

function add_to_object!(object_data::Dict, geometry::GeometryLike, uuid=uuid1())
    object_data["object"]["geometry"] = string(uuid)
    push!(get!(object_data, "geometries", []), serialize(geometry, uuid))
end

function add_to_object!(object_data::Dict, material::AbstractMaterial, uuid=uuid1())
    object_data["object"]["material"] = string(uuid)
    push!(get!(object_data, "materials", []), serialize(material, uuid))
end


function serialize(box::HyperRectangle{3}, uuid=uuid1())
    # TODO: handle intrinsic transform
    w = widths(box)
    Dict{String, Any}(
        "uuid" => string(uuid),
        "type" => "BoxGeometry",
        "width" => w[1],
        "height" => w[2],
        "depth" => w[3]
    )
end

function serialize(material::MeshMaterial, uuid=uuid1())
    Dict{String, Any}(
        "uuid" => string(uuid),
        "type" => threejstype(material),
        "color" => string("0x", hex(convert(RGB, material.color))),
        "transparent" => alpha(material.color) != 1,
        "opacity" => alpha(material.color),
    )
end

abstract type AbstractCommand end

struct SetObject{O <: AbstractObject} <: AbstractCommand
    object::O
    path::Vector{Symbol}
end

function serialize(cmd::SetObject)
    Dict{String, Any}(
        "type" => "set_object",
        "object" => serialize(cmd.object),
        "path" => string.(cmd.path)
    )
end


MsgPack.pack(s::IO, cmd::SetObject) = pack(s, serialize(cmd))


end
