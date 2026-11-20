# Portable unboxing player

Copy the three files from `dist/` into a static site's root. Add a `project.json`, a logo, and the model files referenced by that configuration. Serve over HTTP or HTTPS; the player fetches relative files and is not a double-click `file://` application.

## Project configuration

`project.json` is an object with these fields:

| Field | Value |
| --- | --- |
| `title` | The confirmed brand or experience title. |
| `language` | `en` or `zh`. |
| `paper` | The opaque paper color confirmed for this particular project. |
| `ink` | The opaque ink color confirmed for this particular project. |
| `background` | The opaque stage background color confirmed for this particular project. |
| `logo` | Relative path to the supplied logo, such as `./logo.svg`. |
| `models` | A nonempty array. Each entry contains `name` and either a relative GLB `url`, such as `./models/first-look.glb`, or a nonempty ordered `parts` array, such as `['./models/first-look.part001.bin', './models/first-look.part002.bin']`. Supply exactly one representation per model. |
| `courseUrl` | Optional same-origin course/downloads destination, such as `./course/`. Omit it for ordinary student pages; its navigation link is then hidden. |

Confirm the three colors anew for every project. This asset provides no example project palette; colors are deliberately not supplied as a course preset. The player requires valid opaque colors, derives legible light or dark interface colors from them, and adds a contrasting neutral logo backing only where necessary. The brand artwork itself is not recolored. A single-model experience omits the redundant odds note.

The shell has no editor or embedded model data. It fetches only the model selected for the current box. Each independent selection uses unbiased cryptographic random sampling. A failed download retries the same selected model, so network errors do not skew the distribution. The logo is shown in the header and printed on the front of the packaging.

For a split GLB, the player fetches the selected model's parts in the supplied order, concatenates them into a binary `Blob`, and passes that restored GLB to the decoder. Part URLs resolve relative to the site just like ordinary model URLs. An error in any part leaves the same model selected for retry; it never substitutes another model. The site assembler can split files above its hosting threshold without changing the player shell.

After a successful reveal, visitors can download that model as a GLB directly from the already-loaded binary Blob, including a model reconstructed from parts. Downloading does not fetch the source again. If the next independent draw chooses the same model, the player replays its existing scene object and keeps its Blob rather than transferring or decoding it again. Only the current successfully loaded model is retained in this application cache.

The player retains film peeling, paper tearing, box unfolding, release-to-return model inspection, zoom, English and Chinese labels, optional sound and canvas recording. Recording captures the 3D canvas only, without the interface or audio. No connector, generation service or API key is required by the published player.

## Rebuilding

Run `npm install` and `npm run build` in this folder for normal development. To build with an existing dependency checkout without installing anything in the skill, set `UNBOXING_DEPENDENCY_ROOT` to a project containing the pinned dependencies, then run `node build.mjs`.

`dist/index.html`, `dist/style.css`, and `dist/app.js` are prebuilt. Students and downstream site scripts can copy them without installing packages or running a build. Update the prebuilt files after changing the sources.
