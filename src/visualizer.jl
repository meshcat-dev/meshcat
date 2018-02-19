struct CoreVisualizer
	window::ViewerWindow
end

url(c::CoreVisualizer) = url(c.window)
Base.open(c::CoreVisualizer) = open(c.window)
IJuliaCell(c::CoreVisualizer) = IJuliaCell(c.window)

function Base.send(c::CoreVisualizer, cmd::AbstractCommand)
	send(c.window, pack(Dict("commands" => [lower(cmd)])))
end

struct Visualizer
	core::CoreVisualizer
	path::Vector{Symbol}
end

function Visualizer(;host=ip"127.0.0.1", open=false)
	window = ViewerWindow(host=host, open=open)
	Visualizer(CoreVisualizer(window), [:meshtv])
end

url(v::Visualizer) = url(v.core)
Base.open(v::Visualizer) = open(v.core)
IJuliaCell(v::Visualizer) = IJuliaCell(v.core)

function setobject!(vis::Visualizer, obj::AbstractObject)
	send(vis.core, SetObject(obj, vis.path))
end

setobject!(vis::Visualizer, geom::GeometryLike) = setobject!(vis, convert(Mesh, geom))

function settransform!(vis::Visualizer, tform::Transformation)
    send(vis.core, SetTransform(tform, vis.path))
end

function delete!(vis::Visualizer)
    send(vis.core, Delete(vis.path))
end

Base.getindex(vis::Visualizer, path::Symbol...) = Visualizer(vis.core, vcat(vis.path, path...))

