# Portable GLB optimizer

Requires Node.js 20.19 or newer. Install the pinned dependencies from this directory:

```sh
npm install --omit=dev
node optimize-glb.mjs /path/to/source.glb /path/to/web-copy.glb
```

The two positional paths are required and must be different. All input is read-only. Use a new destination for different compression settings; this helper never overwrites an existing model.

Optional settings:

```sh
node optimize-glb.mjs input.glb output.glb --max-texture-size 1024 --quality 85
```

- Mesh geometry is quantized and Meshopt-compressed, with no face-count simplification. Output requires a Meshopt-capable glTF loader.
- PNG and JPEG PBR textures are resized to fit the texture limit and converted to embedded WebP. Base-color/emissive maps use the requested quality. Normal and data maps use lossless WebP to protect PBR channels; material slots, channels, UVs and sampler settings remain attached to the same texture objects.
- Existing WebP textures within the limit are preserved. Other formats, including existing KTX2 textures, are preserved with a warning instead of being incorrectly transcoded. Draco-compressed GLB input is decoded when its decoder is installed, then written with Meshopt compression.
- Output is actually decoded again before publication. Triangle counts, material counts, per-material texture slots and world bounds are checked. If the optimized file is larger, a validated separate copy of the original is used instead.
- Output is written to a unique temporary GLB beside the target, validated, then published without overwriting an existing path. A failed attempt removes only its own temporary files.

## Caching and concurrency

The output has a sibling `.meta.json` report containing the source SHA-256, output SHA-256, exact compression settings and optimizer version. A repeated request with the same source bytes and settings verifies and reuses that target. A changed input or different settings require another destination. An exclusive `.lock` prevents two simultaneous attempts from publishing to the same target; a crash may leave a lock that should only be removed after confirming the previous process has ended.

The cache key depends on file content rather than its original pathname, so a moved source still reuses the same output. A cache hit does not recompress the GLB. Compression does not call Meshy or spend generation credits.

An existing project with these dependencies can be reused without a second install:

```sh
node optimize-glb.mjs input.glb output.glb --dependencies-dir /path/to/dependency-project
```

This flag is optional and uses the dependency project's package resolution. No machine-specific dependency paths are embedded in the script. Without the flag, resolution starts from this script's package. Keep the pinned dependency versions consistent when reusing another project.

Do not include `node_modules`, generated models, locks or local caches in the skill distribution. Install dependencies on the receiving machine. Package manifests, this helper and this README are the portable resources.
