// Reading values of unknown shape - stored settings, imported files - one
// field at a time, without trusting any of it.
type t

let classify = (value: t) => Type.Classify.classify(value)

let isObject = value =>
  switch classify(value) {
  | Object(_) => !Array.isArray(Obj.magic(value))
  | _ => false
  }

// A field of an object; None for a missing or undefined one, or when the
// value isn't an object.
let field = (value: t, key): option<t> => isObject(value) ? Obj.magic(value)->Dict.get(key) : None

let string = (value: t) =>
  switch classify(value) {
  | String(s) => Some(s)
  | _ => None
  }

let number = (value: t) =>
  switch classify(value) {
  | Number(n) => Some(n)
  | _ => None
  }

let array = (value: t): option<array<t>> =>
  Array.isArray(Obj.magic(value)) ? Some(Obj.magic(value)) : None

// An object's own entries; none for anything else.
let entries = (value: t): array<(string, t)> =>
  isObject(value) ? Obj.magic(value)->Dict.toArray : []

let fromAny: 'a => t = Obj.magic
