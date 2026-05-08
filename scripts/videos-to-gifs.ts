#!/usr/bin/env -S deno run -A
//
// Convert every videos/*.mp4 demo recording into a right-sized GIF in
// docs/gifs/. Two-pass palette generation produces noticeably better
// quality + smaller files than a single ffmpeg pass; both are still well
// under GitHub's 10MB attachment cap at 960px / 10fps.
//
// Usage: `deno task gif`
//   - Skips conversion if the existing GIF is newer than its MP4 source.
//   - Set GIF_FPS / GIF_WIDTH env vars to override the defaults.
//   - Requires ffmpeg on PATH (`brew install ffmpeg` on macOS).

import { ensureDir } from "jsr:@std/fs";
import { basename, extname } from "jsr:@std/path";

// e2e/reporter.ts writes the demo mp4s here. test-results/ is gitignored
// so the sources aren't committed; the rendered gifs in OUT_DIR are.
const SRC_DIR = "test-results/videos";
const OUT_DIR = "docs/gifs";
const FPS = Number(Deno.env.get("GIF_FPS") ?? "10");
const WIDTH = Number(Deno.env.get("GIF_WIDTH") ?? "960");

// Sanity-check ffmpeg before scanning the file list — failing on the first
// mp4 with "command not found" is more confusing than failing up front.
async function ffmpegOnPath(): Promise<boolean> {
  try {
    const { code } = await new Deno.Command("ffmpeg", {
      args: ["-version"],
      stdout: "null",
      stderr: "null",
    }).output();
    return code === 0;
  } catch {
    return false;
  }
}

if (!(await ffmpegOnPath())) {
  console.error(
    "ffmpeg not found on PATH. Install it first:\n" +
      "  brew install ffmpeg          # macOS\n" +
      "  apt-get install ffmpeg       # Debian/Ubuntu",
  );
  Deno.exit(1);
}

await ensureDir(OUT_DIR);

const sources: string[] = [];
try {
  for await (const entry of Deno.readDir(SRC_DIR)) {
    if (entry.isFile && entry.name.endsWith(".mp4")) {
      sources.push(`${SRC_DIR}/${entry.name}`);
    }
  }
} catch (err) {
  if (err instanceof Deno.errors.NotFound) {
    console.error(`${SRC_DIR}/ doesn't exist yet. Run \`deno task demo\` to record first.`);
    Deno.exit(1);
  }
  throw err;
}

if (sources.length === 0) {
  console.error(`No .mp4 files in ${SRC_DIR}/. Run \`deno task demo\` to record first.`);
  Deno.exit(1);
}

sources.sort();

let converted = 0;
let skipped = 0;
let failed = 0;

for (const src of sources) {
  const name = basename(src, extname(src));
  const out = `${OUT_DIR}/${name}.gif`;

  // Skip if the GIF is already up to date.
  try {
    const srcStat = await Deno.stat(src);
    const outStat = await Deno.stat(out);
    if (outStat.mtime && srcStat.mtime && outStat.mtime > srcStat.mtime) {
      console.log(`= ${out} (up to date)`);
      skipped += 1;
      continue;
    }
  } catch {
    // out doesn't exist yet — fall through and convert
  }

  console.log(`→ ${src} → ${out}`);
  const filter =
    `fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
  const { code, stderr } = await new Deno.Command("ffmpeg", {
    args: ["-y", "-i", src, "-vf", filter, "-loop", "0", out],
    stdout: "null",
    stderr: "piped",
  }).output();

  if (code !== 0) {
    console.error(`✗ ffmpeg exited ${code} on ${src}:`);
    console.error(new TextDecoder().decode(stderr).split("\n").slice(-15).join("\n"));
    failed += 1;
    continue;
  }

  const sizeMb = (await Deno.stat(out)).size / 1024 / 1024;
  console.log(`  ${sizeMb.toFixed(1)} MB`);
  if (sizeMb > 10) {
    console.warn(
      `  ⚠ ${out} is over GitHub's 10MB attachment cap. Drop FPS or WIDTH and re-run.`,
    );
  }
  converted += 1;
}

console.log(
  `\nDone. ${converted} converted, ${skipped} up to date${
    failed > 0 ? `, ${failed} failed` : ""
  }.`,
);
if (failed > 0) Deno.exit(1);
