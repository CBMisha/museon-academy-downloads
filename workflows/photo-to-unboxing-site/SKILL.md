---
name: photo-to-unboxing-site
description: Turn a learner's portrait into a branded 3D unboxing experience. Generate figure art, design packaging, create and optimize a Meshy model, and deliver a private site or downloadable files. Use this skill to resume or update an existing project too.
---

# Photo to Unboxing

## Language

Use **English by default** for learner-facing replies, questions, palette explanations, connection instructions, progress updates and handoff. A learner can describe their idea in any language. Continue in English unless they ask for another reply language. Honor an explicit language preference already established for this project. Preserve names, logos, supplied brand copy and quoted wording in their original language.

Treat the conversation and the player as separate preferences. “Reply in Chinese” changes the conversation. “Start the website in Chinese” sets `run.json.language` to `zh`. The player starts in English (`en`) and includes a Chinese switch. Choose the palette preview's language for its intended reader. The bundled preview labels and player controls support English and Chinese; localize other languages explicitly if requested.

## Gather the brief

Work in the learner's own Codex workspace and connected accounts. Read the applicable imagegen and Meshy 3D generation skills, and use the Sites skill for hosting. Group unanswered design questions into one short message. For example:

> What should the figure and its packaging feel like? Tell me where you'll use it, which colors you like or want to avoid, and whether you have a name or logo to keep.

Use the photo for likeness, build and expression. A separate face reference takes precedence for facial details. If the face is hidden, use a face in the requested series style. Default to one model per person. A suitable starting direction is a 3.5–4-head-tall collectible with angular hair, matte skin, broad fabric folds and oversized shoes. Keep the source outfit unless the learner asks for another look. Use their supplied logo or create an original mark for this project.

Guide the learner through first-time plugin installation, account selection and browser authorization in Codex. Reuse existing connections. Leave login and consent to the learner; never put credentials in chat or project files. Check Meshy with `get_balance`. Continue independent local work while a connection is pending.

## Design the packaging

Use the learner's latest description, setting, photo and brand cues to **design a new palette for this project**. Decide how paper, printed ink and backdrop work together. Honor specified brand colors. Treat “make it warmer” or “less like red and black” as feedback to redesign and show a revised proposal. Kraft paper is an option when it fits the brief.

Save each proposal separately as JSON with `paper`, `ink` and `background` (six-digit hex colors), plus optional `title`, `description` and `language`. Generate a visual proof with:

```sh
node <skill-dir>/scripts/palette-preview.mjs <proposal.json> <preview.svg>
```

Show the proof with a short rationale and ask for the learner's choice. Check that the mark and lettering read against the paper and that the box stands out from the background. Write the exact chosen colors into the final manifest once approved, or when the learner delegates the decision.

## Generate the figure and model

Keep each run separate. Record the photo reference, final figure art, logo, original and optimized GLBs, manifest, task settings, request ID, task ID and state. Keep private input photos outside the site checkout. Identify variants by name or thumbnail.

1. Generate an individual full-body reference per requested figure using the built-in image tool. Specify which reference controls identity, clothing and rendering. Use a plain white studio, visible hair and soles, readable silhouette and subtle contact shadow. Inspect and save the accepted image in the run directory.
2. Select the Meshy route for the intended use. For static rendering, an available pairing is geometry `meshy-7.1`, texture `meshy-7`, standard geometry, textures and PBR. Resolve the actual tool schema and pricing from the current connector. Report the estimated cost using the current balance and prices. Proceed within the requested scope and budget. Ask before paid reruns or additional variants.
3. Save one UUID as `request_id` before each new paid submission. Send the **generated figure image** through `image_to_3d` using a supported local file input. For hosts requiring staged uploads, call `create_upload`, PUT the file bytes using the returned headers, then pass the upload ID. Use one input route per task. Observe the returned size limits and expiry times.
4. Save the returned `task_id` immediately. Poll that task with `get_task` to a terminal state. On unknown submission status, reconcile the existing request using the connector's recovery procedure. Reuse the same request ID. A resumed run with a known task starts by looking up the task. Never retry a paid create with a fresh UUID merely because the first response timed out.
5. For a successful task, obtain the GLB with `download_model` and save it locally before the link expires. Build the packaging while Meshy works. If the connector cannot complete a step, follow the Meshy skill's supported fallback. Report actual blockers and charges when known.

## Optimize and assemble

Install the optimizer dependencies according to [its instructions](scripts/optimize/README.md). Keep the original GLB and write a separate web copy:

```sh
node <skill-dir>/scripts/optimize/optimize-glb.mjs <original.glb> <optimized.glb>
```

Record the before/after size. The helper verifies the decoded output and checks geometry bounds and PBR texture assignments. Reuse matching cached output. The player loads only the selected model. The assembler splits models larger than 8 MiB into ordered 4 MiB parts. This is a packaging choice. A browser reassembles the full GLB for that draw or download.

Create `run.json` in the run directory. Provide `title`, `language` (default `en`), the three approved colors, a local logo path, and `models` as an array of objects with `name` and `path` to the optimized local GLB. Relative paths resolve from the manifest. Use the learner's branding and the bundled player:

```sh
node <skill-dir>/scripts/assemble.mjs <run.json> <site-checkout>
```

The experience includes film peeling, a spring-loaded tear strip, automatic opening, packaging fade, independent equal-probability draws, full model rotation with release-to-return, zoom and canvas recording in supported browsers.

## Deliver the learner's project

- **Hosted:** Follow the current Sites skill. Create one site for a new personal project and retain its project ID. For updates, open the existing checkout and use its project ID and audience. Package the assembled static output, push the exact source, and deploy the matching version. Keep credentials in session memory. Follow the same deployment through to success and return the verified URL. Default new projects to private. Change the audience only when requested. When publishing publicly, explain that visitors can save the model.
- **Download or local-only:** Provide a playable static package and its launch instructions. Skip registration and deployment for this route.
- Include the figure count, before/after asset sizes, cost when verifiable, and the local record needed to resume. Say which checks were performed. If an operation is blocked, distinguish delivered files from steps still pending.

## Course downloads

The instructor distributes these versioned files through the existing GitHub repository. Running a learner's project uses their account and does not publish course releases.

- [Student guide](https://github.com/CBMisha/museon-academy-downloads/releases/download/photo-to-unboxing-v1.1.0/unboxing-workflow.html)
- [Installable skill](https://github.com/CBMisha/museon-academy-downloads/releases/download/photo-to-unboxing-v1.1.0/photo-to-unboxing-site.zip)
- [Offline demo](https://github.com/CBMisha/museon-academy-downloads/releases/download/photo-to-unboxing-v1.1.0/unboxing-demo.html)
- [Demo source and static site](https://github.com/CBMisha/museon-academy-downloads/releases/download/photo-to-unboxing-v1.1.0/unboxing-demo.zip)
