const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const ffmpegPath = "ffmpeg";
const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 600 * 1024 * 1024
  }
});

app.use("/outputs", express.static("outputs"));

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("outputs")) fs.mkdirSync("outputs");
if (!fs.existsSync("temp")) fs.mkdirSync("temp");

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function getDuration(filePath) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ["-i", filePath], (error, stdout, stderr) => {
      const match = stderr.match(/Duration: (\\d+):(\\d+):(\\d+\\.\\d+)/);
      if (!match) return resolve(8);

      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);

      resolve(hours * 3600 + minutes * 60 + seconds);
    });
  });
}

function safeText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\n/g, " ");
}

function sceneStart(duration, index, total, mode) {
  if (duration <= 4) return 0;

  if (mode === "fast") {
    return Math.max(0, duration * 0.25);
  }

  if (mode === "soft") {
    return Math.max(0, duration * 0.18);
  }

  const positions = [0.22, 0.38, 0.52, 0.66, 0.78];
  const pos = positions[index % positions.length];

  return Math.max(0, Math.min(duration - 3, duration * pos));
}

function clipLength(totalDuration, fileCount, mode) {
  const count = Math.max(1, fileCount);
  const base = totalDuration / count;

  if (mode === "fast") return Math.max(1.6, Math.min(2.4, base));
  if (mode === "soft") return Math.max(2.8, Math.min(4.2, base));

  return Math.max(2.2, Math.min(3.4, base));
}

function hookY(style) {
  if (style === "center") return "(h-text_h)/2";
  if (style === "minimal") return "h-330";
  return "h-430";
}

function hookFont(style) {
  if (style === "center") return 54;
  if (style === "minimal") return 42;
  return 46;
}

async function createClip(inputPath, outputPath, options) {
  const {
    start,
    duration,
    hook,
    hookStyle,
    index
  } = options;

  const text = safeText(hook);
  const y = hookY(hookStyle);
  const fontSize = hookFont(hookStyle);

  const vf =
    "scale=1080:1920:force_original_aspect_ratio=increase," +
    "crop=1080:1920," +
    "setsar=1," +
    "fps=30," +
    "drawbox=x=0:y=0:w=1080:h=1920:color=black@0.00:t=fill," +
    
    `drawtext=text='${text}':x=(w-text_w)/2:y=${y}:fontsize=${fontSize}:fontcolor=white:line_spacing=12:borderw=3:bordercolor=black@0.65:box=1:boxcolor=black@0.35:boxborderw=28`;

  await runFfmpeg([
    "-y",
    "-ss", String(start),
    "-i", inputPath,
    "-t", String(duration),
    "-vf", vf,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "24",
    "-pix_fmt", "yuv420p",
    outputPath
  ]);
}

async function concatClips(clips, outputPath) {
  const listPath = path.join("temp", "concat-" + Date.now() + ".txt");

  const list = clips
    .map(file => `file '${path.resolve(file).replace(/'/g, "'\\''")}'`)
    .join("\n");

  fs.writeFileSync(listPath, list);

  await runFfmpeg([
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    outputPath
  ]);

  fs.unlinkSync(listPath);
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Enjoy Reels Backend çalışıyor",
    version: "smart-scene-v1"
  });
});

app.post("/render", upload.array("videos", 20), async (req, res) => {
  const files = req.files || [];

  if (!files.length) {
    return res.status(400).json({
      error: "Video yüklenmedi"
    });
  }

  const hook = req.body.hook || "Her hareketin arkasında planlı bir gelişim vardır.";
  const duration = Number(req.body.duration || 18);
  const cut = req.body.cut || "auto";
  const hookStyle = req.body.hookStyle || "bottom";

  const jobId = Date.now();
  const clips = [];
  const scenePlan = [];

  try {
    const perClip = clipLength(duration, files.length, cut);

    for (let i = 0; i < Math.min(files.length, 2); i++) {
      const file = files[i];
      const originalPath = file.path;
      const videoDuration = await getDuration(originalPath);
      const start = sceneStart(videoDuration, i, files.length, cut);

      const clipPath = path.join("temp", `clip-${jobId}-${i}.mp4`);

      await createClip(originalPath, clipPath, {
        start,
        duration: perClip,
        hook,
        hookStyle,
        index: i
      });

      clips.push(clipPath);

      scenePlan.push({
        video: i + 1,
        originalName: file.originalname,
        selectedStart: Math.round(start * 10) / 10,
        selectedDuration: Math.round(perClip * 10) / 10
      });
    }

    const outputName = `enjoy-reels-${jobId}.mp4`;
    const outputPath = path.join("outputs", outputName);

    await concatClips(clips, outputPath);

    for (const file of files) {
      fs.unlink(file.path, () => {});
    }

    for (const clip of clips) {
      fs.unlink(clip, () => {});
    }

    res.json({
      ok: true,
      message: "Akıllı sahne seçimi v1 ile Reels oluşturuldu",
      uploadedVideos: files.length,
      output: "/outputs/" + outputName,
      scenePlan
    });

  } catch (err) {
    res.status(500).json({
  error: err.message,
  detail: err.stack
});
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
