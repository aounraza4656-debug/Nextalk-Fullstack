import fs from "fs";
import path from "path";
import multer from "multer";

const uploadRoot = path.resolve("server/uploads");
const imageDir = path.join(uploadRoot, "images");
const fileDir = path.join(uploadRoot, "files");

for (const dir of [uploadRoot, imageDir, fileDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const isImage = file.mimetype.startsWith("image/");
    cb(null, isImage ? imageDir : fileDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "");
    cb(null, `${Date.now()}-${base || "upload"}${ext}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});
