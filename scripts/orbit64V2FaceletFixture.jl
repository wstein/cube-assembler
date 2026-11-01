#!/usr/bin/env julia
#
# Writes test/cube/notation/orbit64V2Facelets.json from the Orbit64 V2
# reference repository (flix-orbit64, Apache-2.0).
#
#     julia scripts/orbit64V2FaceletFixture.jl <path to flix-orbit64>
#
# It copies the slot tables of FORMAT-V2-SLOTS.md (n = 2..15) and the rows of
# test/TestV2FaceletData.flix, which tools/format-v2/facelet_vectors.jl
# generates there. Nothing is computed here. The row count comes from the
# input. Needs only Julia's standard library; the output is deterministic, and
# written the way `biome format` leaves it, so regenerating it changes nothing.

root = length(ARGS) == 1 ? ARGS[1] : error("usage: julia scripts/orbit64V2FaceletFixture.jl <flix-orbit64 dir>")
read_text(path) = read(joinpath(root, path), String)

revision = strip(read(`git -C $root rev-parse HEAD`, String))
# A tree with uncommitted changes is not the commit it names; the fixture says so.
dirty = !isempty(strip(read(`git -C $root status --porcelain`, String)))
source_name = dirty ? "flix-orbit64@$revision (uncommitted changes)" : "flix-orbit64@$revision"

# ---- FORMAT-V2-SLOTS.md --------------------------------------------------------
#   ## 5x5x5
#   corners   slot: facelets
#     C 0: 24 25 54
#   wings, depth 1
#     W1 0: 1 128
#   centers, 24 slots each, ascending
#     Z[1,1]: 7 10 25 ...
# A slot is the facelets after the colon, in the order listed.

struct Slots
    corners::Vector{String}
    midges::Vector{String}
    wings::Vector{Vector{String}}
    centers::Vector{String}
end

function parse_slots(text::String)
    sizes = Dict{Int,Slots}()
    current = nothing
    kind = :none
    for line in split(text, '\n')
        if (m = match(r"^## (\d+)x\1x\1$", line)) !== nothing
            current = Slots(String[], String[], Vector{String}[], String[])
            sizes[parse(Int, m.captures[1])] = current
            kind = :none
        elseif current === nothing
            continue
        elseif startswith(line, "corners")
            kind = :corners
        elseif startswith(line, "midges")
            kind = :midges
        elseif startswith(line, "wings, depth")
            kind = :wings
            push!(current.wings, String[])
        elseif startswith(line, "centers")
            kind = :centers
        elseif (m = match(r"^  \S+(?: \d+)?: ([\d ]+)$", line)) !== nothing
            kind == :none && error("slot line outside an orbit: $line")
            facelets = join(split(m.captures[1]), " ")
            kind == :corners && push!(current.corners, facelets)
            kind == :midges && push!(current.midges, facelets)
            kind == :wings && push!(current.wings[end], facelets)
            kind == :centers && push!(current.centers, facelets)
        elseif startswith(line, "  ") && !isempty(strip(line))
            error("unparsed slot line: $line")
        end
    end
    sizes
end

slots = parse_slots(read_text("FORMAT-V2-SLOTS.md"))
sort(collect(keys(slots))) == collect(2:15) || error("FORMAT-V2-SLOTS.md: sizes $(sort(collect(keys(slots)))), expected 2:15")
for (n, s) in slots
    length(s.corners) == 8 || error("$(n)x$(n)x$(n): $(length(s.corners)) corners")
    length(s.midges) == (isodd(n) ? 12 : 0) || error("$(n)x$(n)x$(n): $(length(s.midges)) midges")
    length(s.wings) == (n - 2) ÷ 2 || error("$(n)x$(n)x$(n): $(length(s.wings)) wing depths")
    length(s.centers) == ((n - 2)^2) ÷ 4 || error("$(n)x$(n)x$(n): $(length(s.centers)) center orbits")
    all(c -> length(split(c)) == 24, s.centers) || error("$(n)x$(n)x$(n): a center orbit without 24 slots")
    all(w -> length(w) == 24, s.wings) || error("$(n)x$(n)x$(n): a wing depth without 24 slots")
end

# ---- test/TestV2FaceletData.flix -----------------------------------------------
#   (0, "1R", "UFUF RRRR FDFD DBDB LLLL UBUB", "IbH7", ""),

struct Row
    id::Int
    moves::String
    facelets::String
    token::String
    canonical::String
end

row_pattern = r"^\s*\((\d+), \"([^\"]*)\", \"([^\"]*)\", \"([^\"]*)\", \"([^\"]*)\"\),?\s*$"
rows = Row[]
tuple_lines = 0
for line in split(read_text("test/TestV2FaceletData.flix"), '\n')
    # A line that starts a tuple must be a row; the count is checked below.
    occursin(r"^\s*\(\d+,", line) && (global tuple_lines += 1)
    m = match(row_pattern, line)
    m === nothing && continue
    push!(rows, Row(parse(Int, m.captures[1]), m.captures[2], m.captures[3], m.captures[4], m.captures[5]))
end
isempty(rows) && error("TestV2FaceletData.flix: no rows")
length(rows) == tuple_lines || error("TestV2FaceletData.flix: $tuple_lines tuple lines, $(length(rows)) parsed as rows")

# ---- JSON ----------------------------------------------------------------------

function quoted(text::AbstractString)
    out = IOBuffer()
    print(out, '"')
    for c in text
        c == '"' ? print(out, "\\\"") :
        c == '\\' ? print(out, "\\\\") :
        c < ' ' ? print(out, "\\u", string(UInt16(c), base = 16, pad = 4)) : print(out, c)
    end
    print(out, '"')
    String(take!(out))
end

# One `"key": value` line at an indent of `depth` levels of two spaces.
member(depth::Int, key::AbstractString, value::AbstractString) = repeat("  ", depth) * quoted(key) * ": " * value

# Slots are strings, `|` between slots, so that no array is short enough for the
# formatter to join its lines. Indentation is the formatter's.
function slot_object(n::Int, s::Slots)
    wings = isempty(s.wings) ? "{}" :
        "{\n" * join([member(4, string(d), quoted(join(w, " | "))) for (d, w) in enumerate(s.wings)], ",\n") * "\n      }"
    join([
        "    " * quoted(string(n)) * ": {",
        member(3, "corners", quoted(join(s.corners, " | "))) * ",",
        member(3, "midges", quoted(join(s.midges, " | "))) * ",",
        member(3, "wings", wings) * ",",
        member(3, "centers", quoted(join(s.centers, " | "))),
        "    }",
    ], "\n")
end

row_object(r::Row) = join([
    "    {",
    member(3, "id", string(r.id)) * ",",
    member(3, "moves", quoted(r.moves)) * ",",
    member(3, "facelets", quoted(r.facelets)) * ",",
    member(3, "token", quoted(r.token)) * ",",
    member(3, "canonical", quoted(r.canonical)),
    "    }",
], "\n")

slot_text = join([slot_object(n, slots[n]) for n in 2:15], ",\n")
row_text = join([row_object(r) for r in rows], ",\n")

json = """
{
  "source": $(quoted("$source_name: FORMAT-V2-SLOTS.md and test/TestV2FaceletData.flix (generated there by tools/format-v2/facelet_vectors.jl)")),
  "generatedBy": "scripts/orbit64V2FaceletFixture.jl. Do not edit.",
  "slotText": "Facelets of each slot of an orbit, separated by spaces, slots separated by |, in slot order. Wings are keyed by depth, outermost first.",
  "rowText": "id: registry entry; moves: layer turns (depth, face, suffix) and whole-cube turns x y z from the solved cube; facelets: what the entry writes for the cube; token: its V2 token; canonical: the reference pose of that cube when the entry's facelets differ from it, else empty.",
  "rowCount": $(length(rows)),
  "slots": {
$slot_text
  },
  "rows": [
$row_text
  ]
}
"""

target = joinpath(@__DIR__, "..", "test", "cube", "notation", "orbit64V2Facelets.json")
write(target, json)
println("wrote ", length(rows), " rows and the slot tables of ", length(slots), " sizes")
