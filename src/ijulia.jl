
struct IJuliaCell
	window::ViewerWindow
    embed::Bool

    IJuliaCell(window, embed=false) = new(window, embed)
end

function Base.show(io::IO, ::MIME"text/html", frame::IJuliaCell)
    if frame.embed
        show_embed(io, frame)
    else
        show_inline(io, frame)
    end
end

function show_inline(io::IO, frame::IJuliaCell)
    print(io, """
<iframe src="$(geturl(frame.window))" height=500 width=800></iframe>
""")
end

srcdoc_escape(x) = replace(replace(x, "&", "&amp;"), "\"", "&quot;")

function show_embed(io::IO, frame::IJuliaCell)
    id = Base.Random.uuid1()
    print(io, """
    <iframe id="$id" srcdoc="$(srcdoc_escape(readstring(open(joinpath(@__DIR__, "..", "..", "viewer", "build", "inline.html")))))" height=500 width=800>
    </iframe>
    <script>
    function try_to_connect() {
        console.log("trying");
        let frame = document.getElementById("$id");
        if (frame && frame.contentWindow !== undefined && frame.contentWindow.connect !== undefined) {
            frame.contentWindow.connect("$(frame.window.host)", $(frame.window.port));
        } else {
            console.log("could not connect");
          setTimeout(try_to_connect, 100);
        }
    }
    setTimeout(try_to_connect, 1);
    </script>
    """)
end

struct Snapshot
	json::String

    Snapshot(fname::AbstractString) = new(open(readstring, fname))
    Snapshot(io::IO) = new(readstring(io))
end

function Base.show(io::IO, ::MIME"text/html", snap::Snapshot)
	content = readstring(open(joinpath(viewer_root, "build", "inline.html")))
	# TODO: there has to be a better way than doing a replace() on the html.
	script = """
	<script>
	scene = new THREE.ObjectLoader().parse(JSON.parse(`$(snap.json)`));
	update_gui();
	</script>
	</body>
	"""
	html = replace(content, "</body>", script)
	print(io, """
	<iframe srcdoc="$(srcdoc_escape(html))" height=500 width=800>
	</iframe>
	""")
end

function save(fname::String, snap::Snapshot)
    content = readstring(open(joinpath(viewer_root, "build", "inline.html")))
    # TODO: there has to be a better way than doing a replace() on the html.
    script = """
    <script>
    scene = new THREE.ObjectLoader().parse(JSON.parse(`$(snap.json)`));
    update_gui();
    </script>
    </body>
    """
    html = replace(content, "</body>", script)
    open(fname, "w") do file
        write(file, html)
    end
end
