# Security Policy

## Supported versions

Only the current `main` branch and the deployed site at
<https://wstein.github.io/cube-assembler/> receive fixes.

## Scope

CubeAssembler runs entirely in the browser. Camera frames, captures, and
color profiles stay on the device (browser storage and cookies for
preferences) and are not sent to a server. The only upload is the dev
server's **Upload to localhost** action, which goes to the optional fixture
server in `scripts/fixtureUploadServer.mjs`; it only listens on `127.0.0.1`
and is not part of the deployed site.

Relevant reports include, for example, script injection through imported
profile JSON or fixture ZIP files, data leaving the browser unexpectedly, or
a way to reach the fixture upload server from anywhere other than localhost.

## Reporting a vulnerability

Please don't open a public issue. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/wstein/cube-assembler/security/advisories/new)
with steps to reproduce and, if possible, a sample file.

You can expect an acknowledgement within a week. Once a fix is released,
the advisory is published with credit, unless you prefer to stay anonymous.
