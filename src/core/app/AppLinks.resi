@genType
type profilesTab = | @as("colors") Colors | @as("cubes") Cubes

@genType let profilesTab: string => Null.t<profilesTab>
@genType let profilesHash: profilesTab => string

@genType
type link = {href: string, label: string}

@genType let repositoryLink: string => link
