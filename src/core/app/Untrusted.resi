type t

let isObject: t => bool
let field: (t, string) => option<t>
let string: t => option<string>
let number: t => option<float>
let array: t => option<array<t>>
let entries: t => array<(string, t)>
let fromAny: 'a => t
