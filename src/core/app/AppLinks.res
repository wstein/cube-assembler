// The profiles page lives at #profiles, one tab per kind of profile. The
// old #colors link from before the Cubes tab still opens Colors.
type profilesTab = | @as("colors") Colors | @as("cubes") Cubes

let profilesTab = hash =>
  switch hash {
  | "#profiles" | "#profiles/colors" | "#colors" => Null.make(Colors)
  | "#profiles/cubes" => Null.make(Cubes)
  | _ => Null.null
  }

let profilesHash = tab =>
  switch tab {
  | Colors => "#profiles/colors"
  | Cubes => "#profiles/cubes"
  }

let repositoryUrl = "https://github.com/wstein/cube-assembler"
let commitHash = /^[0-9a-f]{7,40}(?=-dirty$|$)/i

type link = {href: string, label: string}

// The repository at the commit the app was built from, when it names one.
let repositoryLink = commit =>
  switch commitHash->RegExp.exec(commit) {
  | Some(result) =>
    let hash = RegExp.Result.fullMatch(result)
    let dirty = commit->String.endsWith("-dirty") ? "-dirty" : ""
    {
      href: `${repositoryUrl}/tree/${hash}`,
      label: `GitHub · ${hash->String.slice(~start=0, ~end=7)}${dirty}`,
    }
  | None => {href: repositoryUrl, label: "GitHub"}
  }
