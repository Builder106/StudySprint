import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { mkdirSync, renameSync } from "fs";
import { join } from "path";

const VIDEOS_DIR = "test-results/videos";

class VideoRenameReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    const video = result.attachments.find((a) => a.name === "video");
    if (!video?.path) return;

    mkdirSync(VIDEOS_DIR, { recursive: true });

    // Build a descriptive filename from the full test title path.
    // e.g. "Authentication - Successful registration with valid credentials"
    const slug = test
      .titlePath()
      .slice(1) // drop the file path segment
      .join(" - ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    try {
      renameSync(video.path, join(VIDEOS_DIR, `${slug}.webm`));
    } catch {
      // video file may already have been moved or test was skipped
    }
  }
}

export default VideoRenameReporter;
