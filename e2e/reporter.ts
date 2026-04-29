import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { spawn } from "child_process";
import { mkdirSync, renameSync, readdirSync, rmdirSync, unlinkSync, existsSync, statSync } from "fs";
import { basename, dirname, join } from "path";

const VIDEOS_DIR = "test-results/videos";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Build a short, human-readable name from the test's titlePath.
// titlePath looks like ["", "chromium", "e2e/features/auth.feature.spec.js", "Authentication", "Successful login..."]
// We want: "<feature> - <scenario>", e.g. "auth - successful-login".
function buildSlug(test: TestCase): string {
  const parts = test.titlePath();
  const filePart = parts.find((p) => p.includes(".feature")) ?? "";
  const featureMatch = filePart.match(/([^/\\]+)\.feature/);
  const feature = featureMatch ? featureMatch[1] : "";
  const scenario = parts[parts.length - 1] ?? "";
  const combined = feature ? `${feature} - ${scenario}` : scenario;
  return slugify(combined);
}

function convertToMp4(webmPath: string): Promise<void> {
  return new Promise((resolve) => {
    // Empty/corrupt webm — drop it, no point feeding it to ffmpeg.
    try {
      if (statSync(webmPath).size === 0) {
        unlinkSync(webmPath);
        return resolve();
      }
    } catch { /* ignore */ }
    const mp4Path = webmPath.replace(/\.webm$/i, ".mp4");
    const ff = spawn(
      "ffmpeg",
      [
        "-y",
        "-loglevel", "error",
        "-i", webmPath,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        mp4Path,
      ],
      { stdio: "ignore" },
    );
    ff.on("error", () => resolve()); // ffmpeg missing — keep webm
    ff.on("exit", (code) => {
      if (code === 0 && existsSync(mp4Path)) {
        try { unlinkSync(webmPath); } catch { /* ignore */ }
      }
      resolve();
    });
  });
}

class VideoRenameReporter implements Reporter {
  // Defer renames until onEnd. Playwright finalizes the first test's video
  // asynchronously — at onTestEnd time the file may still be 0 bytes, which
  // would later cause convertToMp4 to delete it. By the time onEnd fires,
  // every test's video is fully written.
  private pending: { sourcePath: string; slug: string }[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    const slug = buildSlug(test);
    const video = result.attachments.find((a) => a.name === "video");
    // Warmup scenarios exist only to absorb a Playwright bug where one early
    // test in a single-worker run with slowMo+video records a 0-byte file.
    // Their videos are throwaway, but we still need to delete the leftover
    // per-test output folder so it doesn't clutter test-results/.
    if (slug.startsWith("00-warmup")) {
      if (video?.path) {
        try { unlinkSync(video.path); } catch { /* ignore */ }
        const dir = dirname(video.path);
        try {
          if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
        } catch { /* ignore */ }
      }
      return;
    }
    if (!video?.path) return;
    this.pending.push({ sourcePath: video.path, slug });
  }

  async onEnd() {
    mkdirSync(VIDEOS_DIR, { recursive: true });
    const webmFiles: string[] = [];

    for (const { sourcePath, slug } of this.pending) {
      const target = join(VIDEOS_DIR, `${slug}.webm`);
      const sourceDir = dirname(sourcePath);
      try {
        if (!existsSync(sourcePath)) continue;
        renameSync(sourcePath, target);
        webmFiles.push(target);
      } catch {
        // file already moved or run skipped
      }
      try {
        if (existsSync(sourceDir) && readdirSync(sourceDir).length === 0) {
          rmdirSync(sourceDir);
        }
      } catch {
        // keep folder if anything goes wrong
      }
    }

    // Sweep any leftover .webm files (e.g. from earlier runs) into the queue.
    if (existsSync(VIDEOS_DIR)) {
      for (const name of readdirSync(VIDEOS_DIR)) {
        if (name.endsWith(".webm")) {
          const full = join(VIDEOS_DIR, name);
          if (!webmFiles.includes(full)) webmFiles.push(full);
        }
      }
    }
    if (webmFiles.length === 0) return;
    process.stdout.write(`Converting ${webmFiles.length} video(s) to mp4…\n`);
    await Promise.all(webmFiles.map(convertToMp4));
    process.stdout.write(`  ✓ ${basename(VIDEOS_DIR)}/ updated\n`);
  }
}

export default VideoRenameReporter;
