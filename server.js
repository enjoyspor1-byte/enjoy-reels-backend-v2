const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(cors());

const upload = multer({
  dest: "uploads/"
});

app.use("/outputs", express.static("outputs"));

if (!fs.existsSync("outputs")) {
  fs.mkdirSync("outputs");
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Enjoy Reels Backend çalışıyor"
  });
});

app.post("/render", upload.array("videos", 20), async (req, res) => {
  try {
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({
        error: "Video yüklenmedi"
      });
    }

    const firstVideo = files[0];
    const originalPath = firstVideo.path;
    const outputName = "enjoy-reels-" + Date.now() + path.extname(firstVideo.originalname || ".mp4");
    const outputPath = path.join("outputs", outputName);

    fs.copyFileSync(originalPath, outputPath);

    res.json({
      ok: true,
      uploadedVideos: files.length,
      message: "İlk video çıktı olarak hazırlandı",
      output: "/outputs/" + outputName
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
