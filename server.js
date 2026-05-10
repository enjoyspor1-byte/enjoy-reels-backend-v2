const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();

app.use(cors());

const upload = multer({
  dest: "uploads/"
});

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

    res.json({
      ok: true,
      uploadedVideos: files.length,
      message: "Render sistemi hazır"
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
