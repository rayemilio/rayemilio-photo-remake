import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

const CDN_BASE = "https://m2.22slides.com/rayemiliophotography/";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const APPLY = process.argv.includes("--apply");

const filenameMap = new Map([
  ["home-statue-light.jpeg", "statue-light-399.jpeg"],
  ["artist-statement-photo.jpg", "000588920008-blurred-bg-567.jpg"]
]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return walk(path);
    }

    return IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()) ? [path] : [];
  });
}

function curl(args) {
  return execFileSync("curl", [
    "-L",
    "--fail",
    "--silent",
    "--show-error",
    "--connect-timeout",
    "12",
    "--max-time",
    "90",
    "--retry",
    "3",
    "--retry-delay",
    "2",
    "--retry-all-errors",
    ...args
  ], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 20
  });
}

function readCdxRows(url) {
  const body = curl([url]).toString("utf8");
  const rows = JSON.parse(body);

  if (!Array.isArray(rows) || rows.length < 2) {
    return [];
  }

  return rows.slice(1).map(([timestamp, original, statuscode, mimetype, digest, length]) => ({
    timestamp,
    original,
    statuscode,
    mimetype,
    digest,
    length: Number(length) || 0
  }));
}

function loadCdnIndex(cachePath) {
  if (existsSync(cachePath)) {
    const cachedRows = JSON.parse(readFileSync(cachePath, "utf8"));
    return buildCdnIndex(cachedRows);
  }

  const url = `https://web.archive.org/cdx?url=${encodeURIComponent(`${CDN_BASE}*`)}&output=json&fl=timestamp,original,statuscode,mimetype,digest,length&filter=statuscode:200&filter=mimetype:image/jpeg&collapse=digest`;
  const rows = readCdxRows(url);
  writeFileSync(cachePath, JSON.stringify(rows, null, 2));

  return buildCdnIndex(rows);
}

function buildCdnIndex(rows) {
  const index = new Map();

  for (const row of rows) {
    const filename = basename(new URL(row.original).pathname);
    const entries = index.get(filename) ?? [];
    entries.push(row);
    index.set(filename, entries);
  }

  return index;
}

function candidateScore(entry) {
  const url = new URL(entry.original);
  const width = Number(url.searchParams.get("w")) || 0;
  const quality = Number(url.searchParams.get("q")) || 100;

  return {
    width,
    quality,
    length: entry.length
  };
}

function sortCandidates(a, b) {
  const aScore = candidateScore(a);
  const bScore = candidateScore(b);

  return (
    bScore.width - aScore.width ||
    bScore.quality - aScore.quality ||
    bScore.length - aScore.length
  );
}

async function metadata(path) {
  const image = sharp(path);
  const meta = await image.metadata();

  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format ?? "unknown",
    size: statSync(path).size
  };
}

function downloadCandidate(entry, destination) {
  const directUrl = entry.original;
  const archiveUrl = `https://web.archive.org/web/${entry.timestamp}im_/${entry.original}`;

  for (const url of [directUrl, archiveUrl]) {
    try {
      curl(["-o", destination, url]);
      return url;
    } catch (error) {
      // Try the next source.
    }
  }

  return undefined;
}

const roots = ["src/content/galleries", "src/assets"];
const localImages = roots.flatMap((root) => walk(root));
const tempRoot = join(tmpdir(), "rayemilio-22slides-cdn-audit");
mkdirSync(tempRoot, { recursive: true });

const cdnIndex = loadCdnIndex(join(tempRoot, "cdn-index.json"));
const report = [];

for (const localPath of localImages) {
  const localName = basename(localPath);
  const cdnName = filenameMap.get(localName) ?? localName;
  const localMeta = await metadata(localPath);
  const entries = (cdnIndex.get(cdnName) ?? []).sort(sortCandidates);
  let best;

  for (const entry of entries.slice(0, 12)) {
    const candidatePath = join(tempRoot, `${cdnName.replace(/[^a-z0-9._-]/gi, "_")}-${entry.timestamp}.jpg`);
    const sourceUrl = downloadCandidate(entry, candidatePath);

    if (!sourceUrl) {
      continue;
    }

    try {
      const candidateMeta = await metadata(candidatePath);
      const candidateArea = candidateMeta.width * candidateMeta.height;
      const localArea = localMeta.width * localMeta.height;

      if (!best || candidateArea > best.meta.width * best.meta.height) {
        best = {
          entry,
          path: candidatePath,
          meta: candidateMeta,
          sourceUrl
        };
      }

      if (candidateArea > localArea && candidateMeta.width >= localMeta.width && candidateMeta.height >= localMeta.height) {
        break;
      }
    } catch (error) {
      // Ignore non-image Wayback wrappers.
    }
  }

  const localArea = localMeta.width * localMeta.height;
  const bestArea = best ? best.meta.width * best.meta.height : 0;
  const upgraded = Boolean(best && bestArea > localArea);

  if (APPLY && upgraded) {
    copyFileSync(best.path, localPath);
  }

  report.push({
    localPath,
    cdnName,
    local: localMeta,
    best: best
      ? {
          width: best.meta.width,
          height: best.meta.height,
          size: best.meta.size,
          sourceUrl: best.sourceUrl,
          original: best.entry.original
        }
      : undefined,
    status: upgraded ? (APPLY ? "replaced" : "upgrade-available") : best ? "already-best-or-larger" : "no-cdn-match"
  });
}

writeFileSync(
  join(tempRoot, "report.json"),
  JSON.stringify(report, null, 2)
);

for (const item of report) {
  const local = `${item.local.width}x${item.local.height}`;
  const best = item.best ? `${item.best.width}x${item.best.height}` : "none";
  console.log(`${item.status.padEnd(24)} ${local.padEnd(11)} -> ${best.padEnd(11)} ${item.localPath}`);
}

console.log(`\nReport: ${join(tempRoot, "report.json")}`);
