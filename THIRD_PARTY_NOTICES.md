# Third-party notices

IELTS Writing Coach is distributed under Apache-2.0, but its JavaScript dependency graph contains separately licensed software. The release SBOM is the authoritative package-and-version inventory. Maintainers run `pnpm licenses:check` on every CI and release build; an unreviewed license expression fails the build.

Most dependencies use MIT, ISC, Apache-2.0, BSD, BlueOak, Python-2.0, or equivalent permissive terms. The following redistributable components need particular notice:

| Component                               | License                                                            | Use and source                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caniuse-lite` data                     | CC-BY-4.0                                                          | Browser compatibility data; <https://github.com/browserslist/caniuse-lite>                                                                                       |
| `lightningcss` and platform binaries    | MPL-2.0                                                            | CSS parser/compiler used by the Web build; <https://github.com/parcel-bundler/lightningcss>                                                                      |
| `@img/sharp-libvips-*` native libraries | LGPL-3.0-or-later and the component licenses listed by the package | Dynamically loaded image-processing libraries distributed by sharp; source and exact build metadata are available from <https://github.com/lovell/sharp-libvips> |

The native libvips package includes libraries under LGPL terms through the “any later version” option of LGPL-2.0/2.1, plus MPL and permissive components documented in that package's README. Nothing in this project's license restricts rights granted by those third-party licenses. Do not remove dependency license files or notices from redistributed source trees or container layers.

To inspect the complete installed inventory locally:

```bash
pnpm licenses list --json
```

No third-party dependency is required by the standalone Codex Skill; it uses Python's standard library.
