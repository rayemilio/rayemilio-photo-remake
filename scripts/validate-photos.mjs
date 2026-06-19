import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const galleriesDir = path.join(root, "src", "content", "galleries");
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".svg"]);
const maxRecommendedBytes = 500 * 1024;
const warnings = [];
const errors = [];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  return JSON.parse(source);
}

const categoryEntries = await fs.readdir(galleriesDir, { withFileTypes: true });

for (const entry of categoryEntries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const category = entry.name;
  const categoryDir = path.join(galleriesDir, category);
  const galleryPath = path.join(categoryDir, "gallery.json");
  const fileEntries = await fs.readdir(categoryDir, { withFileTypes: true });
  const imageFiles = fileEntries
    .filter((fileEntry) => fileEntry.isFile())
    .map((fileEntry) => fileEntry.name)
    .filter((fileName) => imageExtensions.has(path.extname(fileName).toLowerCase()));

  if (!(await exists(galleryPath))) {
    warnings.push(`${category}: missing gallery.json; images will use fallback metadata.`);
    continue;
  }

  let gallery;

  try {
    gallery = await readJson(galleryPath);
  } catch (error) {
    errors.push(`${category}: gallery.json could not be parsed (${error.message}).`);
    continue;
  }

  const listedFiles = new Set();

  for (const photo of gallery.photos ?? []) {
    if (!photo.file) {
      errors.push(`${category}: a photo entry is missing "file".`);
      continue;
    }

    listedFiles.add(photo.file);

    if (!imageFiles.includes(photo.file)) {
      errors.push(`${category}: gallery.json references missing file "${photo.file}".`);
    }

    if (!photo.alt) {
      warnings.push(`${category}/${photo.file}: missing alt text.`);
    }

    if (!photo.caption) {
      warnings.push(`${category}/${photo.file}: missing caption.`);
    }
  }

  for (const imageFile of imageFiles) {
    const filePath = path.join(categoryDir, imageFile);
    const stats = await fs.stat(filePath);

    if (!listedFiles.has(imageFile)) {
      warnings.push(`${category}/${imageFile}: image is not listed in gallery.json; it will appear at the end.`);
    }

    if (stats.size > maxRecommendedBytes) {
      warnings.push(`${category}/${imageFile}: source file is ${Math.round(stats.size / 1024)} KB; recommended max is 500 KB.`);
    }
  }
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

for (const error of errors) {
  console.error(`Error: ${error}`);
}

if (errors.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`Photo validation completed with ${warnings.length} warning(s).`);
}
