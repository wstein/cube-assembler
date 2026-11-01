#!/usr/bin/env julia
#
# Writes test/cube/notation/orbit64V2Facelets.json and
# test/cube/notation/orbit64V2FaceletPictures.json from the Orbit64 V2
# reference repository (flix-orbit64, Apache-2.0).
#
#     julia scripts/orbit64V2FaceletFixture.jl <path to flix-orbit64>
#
# The first copies the slot tables of FORMAT-V2-SLOTS.md (n = 2..15) and the
# color rows of test/TestV2FaceletData.flix, which
# tools/format-v2/facelet_vectors.jl generates there. The second copies the
# picture rows of test/TestV2FaceletPictureData.flix, which
# tools/format-v2/facelet_picture_vectors.jl generates there (n = 3..15). Nothing
# is computed here. Both inputs are checked for dropped, duplicated and
# unparsed rows, and their row and move sequence counts are pinned below. Needs
# only Julia's standard library; the output is deterministic, and written the
# way `biome format` leaves it, so regenerating it changes nothing.

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
# Structure the input already has: every move sequence of a size is written once
# for each of its two color entries (canonical and framed). A dropped row leaves
# a sequence with one entry, and an extra one a sequence with three.
rows_by_sequence = Dict{Tuple{Int,String},Vector{Int}}()
ids_by_size = Dict{Int,Set{Int}}()
for r in rows
    cells = length(replace(r.facelets, " " => ""))
    n = round(Int, sqrt(cells / 6))
    6n^2 == cells || error("row of entry $(r.id): $cells facelets are no cube")
    push!(get!(rows_by_sequence, (n, r.moves), Int[]), r.id)
    push!(get!(ids_by_size, n, Set{Int}()), r.id)
end
for (n, ids) in ids_by_size
    length(ids) == 2 || error("$(n)x$(n)x$(n): rows of $(length(ids)) entries, expected 2")
end
for ((n, moves), ids) in rows_by_sequence
    sort(ids) == sort(collect(ids_by_size[n])) ||
        error("$(n)x$(n)x$(n): moves \"$moves\" have rows for entries $(sort(ids)), expected $(sort(collect(ids_by_size[n]))) once each")
end
sort(collect(keys(ids_by_size))) == collect(2:15) || error("rows for sizes $(sort(collect(keys(ids_by_size)))), expected 2:15")

# Pinned counts of the reference repository's rows: dropping both rows of a move
# sequence leaves the structure above intact, so the counts are fixed here and in
# the test. When the reference adds or removes rows, change them with the input.
const EXPECTED_SEQUENCES = Dict(2 => 32, 3 => 41, 4 => 50, 5 => 59, 6 => 5, 7 => 5,
    8 => 4, 9 => 4, 10 => 4, 11 => 4, 12 => 4, 13 => 4, 14 => 4, 15 => 4)
const EXPECTED_ROWS = 2 * sum(values(EXPECTED_SEQUENCES))
length(rows) == EXPECTED_ROWS || error("TestV2FaceletData.flix: $(length(rows)) rows, expected $EXPECTED_ROWS")
sequences_per_size = Dict(n => count(k -> k[1] == n, keys(rows_by_sequence)) for n in keys(ids_by_size))
sequences_per_size == EXPECTED_SEQUENCES || error("TestV2FaceletData.flix: move sequences per size $(sort(collect(sequences_per_size))), expected $(sort(collect(EXPECTED_SEQUENCES)))")

# ---- test/TestV2FaceletPictureData.flix -----------------------------------------
#        (4, "1R", "GGCEAQDCN ORBJFBWXL ...",
#         "Jx4QRAuFTAAAE",
#         ""),
# A row is three lines. The empty move text is the solved cube.

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
picture_pattern = r"^\s*\((\d+), \"([^\"]*)\", \"([^\"]*)\",\n\s*\"([^\"]*)\",\n\s*\"([^\"]*)\"\),?[ \t]*$"m
picture_text = read_text("test/TestV2FaceletPictureData.flix")
picture_tuple_lines = length(collect(eachmatch(r"^\s*\(\d+,"m, picture_text)))
picture_rows = [Row(parse(Int, m.captures[1]), m.captures[2], m.captures[3], m.captures[4], m.captures[5])
                for m in eachmatch(picture_pattern, picture_text)]
isempty(picture_rows) && error("TestV2FaceletPictureData.flix: no rows")
length(picture_rows) == picture_tuple_lines ||
    error("TestV2FaceletPictureData.flix: $picture_tuple_lines tuple lines, $(length(picture_rows)) parsed as rows")
# The same structure as the color rows: a picture entry per pose, each move
# sequence of a size once for both. The picture entry ids of the registry are
# 4n - 8 (canonical) and 4n - 7 (framed) for n = 3..15; every size has exactly them.
picture_sequences = Dict{Tuple{Int,String},Vector{Int}}()
picture_ids = Dict{Int,Set{Int}}()
for r in picture_rows
    cells = length(replace(r.facelets, " " => ""))
    n = round(Int, sqrt(cells / 6))
    6n^2 == cells || error("picture row of entry $(r.id): $cells facelets are no cube")
    all(c -> c == ' ' || occursin(c, BASE64URL), r.facelets * r.canonical) ||
        error("picture row of entry $(r.id): a character outside the base64url alphabet")
    all(c -> occursin(c, BASE64URL), r.token) && !isempty(r.token) ||
        error("picture row of entry $(r.id): token \"$(r.token)\" is not base64url")
    r.canonical == "" || length(replace(r.canonical, " " => "")) == cells ||
        error("picture row of entry $(r.id): canonical facelets of another length")
    r.id in (4n - 8, 4n - 7) || error("picture row of entry $(r.id) at size $n, expected $(4n - 8) or $(4n - 7)")
    push!(get!(picture_sequences, (n, r.moves), Int[]), r.id)
    push!(get!(picture_ids, n, Set{Int}()), r.id)
end
# A token has the length of its entry, so the rows of one entry agree on it.
token_lengths = Dict{Int,Set{Int}}()
for r in picture_rows
    push!(get!(token_lengths, r.id, Set{Int}()), length(r.token))
end
for (id, lengths) in token_lengths
    length(lengths) == 1 || error("picture rows of entry $id have tokens of lengths $(sort(collect(lengths)))")
end
sort(collect(keys(picture_ids))) == collect(3:15) ||
    error("picture rows for sizes $(sort(collect(keys(picture_ids)))), expected 3:15")
for (n, ids) in picture_ids
    ids == Set([4n - 8, 4n - 7]) || error("$(n)x$(n)x$(n): picture rows of entries $(sort(collect(ids))), expected $(4n - 8) and $(4n - 7)")
end
for ((n, moves), ids) in picture_sequences
    sort(ids) == [4n - 8, 4n - 7] ||
        error("$(n)x$(n)x$(n): picture moves \"$moves\" have rows for entries $(sort(ids)), expected $(4n - 8) and $(4n - 7) once each")
end
# Pinned like the color counts: dropping both rows of a move sequence leaves the
# structure above intact. Change them together with the input.
const EXPECTED_PICTURE_SEQUENCES = Dict(3 => 41, 4 => 4, 5 => 5, 6 => 4, 7 => 5, 8 => 3,
    9 => 4, 10 => 3, 11 => 4, 12 => 3, 13 => 4, 14 => 3, 15 => 4)
const EXPECTED_PICTURE_ROWS = 2 * sum(values(EXPECTED_PICTURE_SEQUENCES))
EXPECTED_PICTURE_ROWS == 174 || error("the pinned picture counts add up to $EXPECTED_PICTURE_ROWS rows, expected 174")
length(picture_rows) == EXPECTED_PICTURE_ROWS ||
    error("TestV2FaceletPictureData.flix: $(length(picture_rows)) rows, expected $EXPECTED_PICTURE_ROWS")
picture_per_size = Dict(n => count(k -> k[1] == n, keys(picture_sequences)) for n in keys(picture_ids))
picture_per_size == EXPECTED_PICTURE_SEQUENCES ||
    error("TestV2FaceletPictureData.flix: move sequences per size $(sort(collect(picture_per_size))), expected $(sort(collect(EXPECTED_PICTURE_SEQUENCES)))")

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

picture_json = """
{
  "source": $(quoted("$source_name: test/TestV2FaceletPictureData.flix (generated there by tools/format-v2/facelet_picture_vectors.jl)")),
  "generatedBy": "scripts/orbit64V2FaceletFixture.jl. Do not edit.",
  "rowText": "id: registry entry; moves: layer turns (depth, face, suffix) and whole-cube turns x y z from the solved cube, empty for the solved cube; facelets: what the entry writes for the cube, one base64url symbol per facelet; token: its V2 token; canonical: the reference pose of that cube when the entry's facelets differ from it, else empty.",
  "rowCount": $(length(picture_rows)),
  "rows": [
$(join([row_object(r) for r in picture_rows], ",\n"))
  ]
}
"""

notation = joinpath(@__DIR__, "..", "test", "cube", "notation")
write(joinpath(notation, "orbit64V2Facelets.json"), json)
write(joinpath(notation, "orbit64V2FaceletPictures.json"), picture_json)
println("wrote ", length(rows), " color rows and the slot tables of ", length(slots), " sizes, and ",
        length(picture_rows), " picture rows")
