# MP4 application walkthroughs

Each prompt has an H.264 MP4 beside its original Playwright WebM:

```text
apps/prompt-NN/artifacts/prompt-NN-demo.mp4
apps/prompt-NN/artifacts/prompt-NN-demo.webm
apps/prompt-NN/artifacts/mp4-verification.json
```

The exports preserve the original resolution, frame count, duration, light/dark demonstrations and coloured code. They contain application footage only; narration, lesson introductions and explanatory overlays have not been added.

The [application index](../README.md) links to both formats. Each lesson’s README lists the exercise sequence and controls to explain while presenting the footage. Simulated provider behavior remains labelled in the recorded application.

## Recreate or resume exports

The conversion uses a portable FFmpeg binary inside `.tools`; it does not change system settings. The pinned Windows build is downloaded from a provider linked by [FFmpeg’s download page](https://ffmpeg.org/download.html). The setup script verifies the archive against the build provider’s published SHA-256 checksum.

Run in `apps/course-lab`:

```powershell
./scripts/setup-video-tools.ps1
npm run export:mp4
```

Alternatively set `FFMPEG_PATH` and `FFPROBE_PATH` to an existing H.264-capable installation. Conversion uses CRF 16, the fast preset, compatible YUV420p pixels and MP4 fast start. No resizing, cropping, synthetic audio or narration is applied. The original WebM files remain intact.

The exporter skips an output only when its source hash, output hash, settings and successful receipt match. A changed source is converted again. An existing MP4 without an exporter receipt is preserved. A partial conversion uses a separate `.encoding.mp4` file and becomes the final output only after validation succeeds.

For a subset or a different concurrency level:

```powershell
$env:LESSONS = '16,111,150,180'
$env:MP4_WORKERS = '2'
npm run export:mp4
Remove-Item Env:LESSONS
Remove-Item Env:MP4_WORKERS
```

## Verification

For every export, FFprobe counts decoded source and output frames. The exporter checks resolution, frame count, duration, H.264, pixel format and the location of the MP4 metadata before fully decoding every output frame with FFmpeg. Each successful file has an adjacent `mp4-verification.json` receipt containing hashes and measured facts.

`artifacts/mp4-progress.json` records the export batch and any failures. Representative MP4 files are also loaded and seeked in actual Chrome; playback receipts are in `artifacts/mp4-browser-playback.json`. The browser check can be repeated with:

```powershell
node scripts/check-mp4-playback.mjs
```

After new exports, refresh the lesson links and index:

```powershell
node scripts/link-mp4.mjs
node scripts/index.mjs
```
