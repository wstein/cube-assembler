# Security Policy

## Supported versions

Only the current `main` branch and the deployed site at
<https://wstein.github.io/cube-assembler/> receive fixes.

## Scope

CubeAssembler runs entirely in the browser. Camera frames, captures, and
color profiles stay on the device (browser storage and cookies for
preferences) and are not sent to a server. The only upload is **Upload to
localhost**, which sends a saved fixture to the optional fixture server in
`scripts/fixtureUploadServer.mjs` running on the same computer. That server
only listens on `127.0.0.1` and accepts browser uploads only from localhost
pages and the published app's origin.

Relevant reports include, for example, script injection through imported
profile JSON or fixture ZIP files, data leaving the browser unexpectedly, or
a way for any other site to upload to the fixture server.

## Reporting a vulnerability

Please don't open a public issue. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/wstein/cube-assembler/security/advisories/new)
with steps to reproduce and, if possible, a sample file.

You can expect an acknowledgement within a week. Once a fix is released,
the advisory is published with credit, unless you prefer to stay anonymous.
