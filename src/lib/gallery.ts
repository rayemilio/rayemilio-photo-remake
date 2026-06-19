import siteContent from "../content/site.json";
import type { ImageMetadata } from "astro";

export type PhotoRef = {
  category: string;
  slug: string;
};

export type SiteContent = typeof siteContent;

type RawPhoto = {
  file: string;
  slug?: string;
  alt?: string;
  caption?: string;
  details?: string;
};

type RawGallery = {
  title?: string;
  order?: number;
  photos?: RawPhoto[];
};

type ImageModule = {
  default: ImageMetadata;
};

type ImageAsset = {
  file: string;
  image: ImageMetadata;
  isSvg: boolean;
};

export type GalleryPhoto = {
  category: string;
  categoryTitle: string;
  file: string;
  slug: string;
  alt: string;
  caption: string;
  details: string;
  href: string;
  categoryHref: string;
  image: ImageMetadata;
  width: number;
  height: number;
  isSvg: boolean;
  previousHref?: string;
  nextHref?: string;
};

export type Gallery = {
  slug: string;
  title: string;
  order: number;
  href: string;
  photos: GalleryPhoto[];
};

const galleryModules = import.meta.glob("/src/content/galleries/*/gallery.json", {
  eager: true
}) as Record<string, { default: RawGallery } | RawGallery>;

const imageModules = import.meta.glob("/src/content/galleries/**/*.{jpg,jpeg,png,webp,avif,svg}", {
  eager: true
}) as Record<string, ImageModule>;

function getModuleDefault<T>(moduleValue: { default: T } | T): T {
  if (
    moduleValue &&
    typeof moduleValue === "object" &&
    "default" in moduleValue
  ) {
    return moduleValue.default;
  }

  return moduleValue as T;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function photoSlugFromFile(file: string): string {
  return file.replace(/\.[^.]+$/, "");
}

function normalizeHref(...parts: string[]): string {
  return `/${parts.map((part) => part.replace(/^\/|\/$/g, "")).join("/")}/`;
}

function categoryFromGalleryPath(path: string): string {
  const match = path.match(/\/src\/content\/galleries\/([^/]+)\/gallery\.json$/);

  if (!match) {
    throw new Error(`Unable to read gallery category from ${path}`);
  }

  return match[1];
}

function imagePartsFromPath(path: string): { category: string; file: string } {
  const match = path.match(/\/src\/content\/galleries\/([^/]+)\/([^/]+)$/);

  if (!match) {
    throw new Error(`Unable to read image path from ${path}`);
  }

  return {
    category: match[1],
    file: match[2]
  };
}

function sortByFileName(a: ImageAsset, b: ImageAsset): number {
  return a.file.localeCompare(b.file, undefined, { numeric: true });
}

const galleryConfigs = new Map<string, RawGallery>();

for (const [path, moduleValue] of Object.entries(galleryModules)) {
  galleryConfigs.set(categoryFromGalleryPath(path), getModuleDefault(moduleValue));
}

const imagesByCategory = new Map<string, Map<string, ImageAsset>>();

for (const [path, moduleValue] of Object.entries(imageModules)) {
  const { category, file } = imagePartsFromPath(path);
  const categoryImages = imagesByCategory.get(category) ?? new Map<string, ImageAsset>();

  categoryImages.set(file, {
    file,
    image: moduleValue.default,
    isSvg: file.toLowerCase().endsWith(".svg")
  });

  imagesByCategory.set(category, categoryImages);
}

function buildGallery(category: string): Gallery {
  const config = galleryConfigs.get(category) ?? {};
  const imageMap = imagesByCategory.get(category) ?? new Map<string, ImageAsset>();
  const usedFiles = new Set<string>();
  const usedSlugs = new Set<string>();
  const title = config.title ?? titleFromSlug(category);
  const categoryHref = normalizeHref(category);
  const configuredPhotos = config.photos ?? [];

  const photos: GalleryPhoto[] = configuredPhotos.map((photoConfig) => {
    const asset = imageMap.get(photoConfig.file);

    if (!asset) {
      throw new Error(
        `${category}/gallery.json references "${photoConfig.file}", but that file does not exist.`
      );
    }

    usedFiles.add(photoConfig.file);

    const slug = photoConfig.slug ?? photoSlugFromFile(photoConfig.file);

    if (usedSlugs.has(slug)) {
      throw new Error(`${category}/gallery.json has a duplicate photo slug "${slug}".`);
    }

    usedSlugs.add(slug);

    return {
      category,
      categoryTitle: title,
      file: photoConfig.file,
      slug,
      alt: photoConfig.alt ?? "",
      caption: photoConfig.caption ?? "",
      details: photoConfig.details ?? "",
      href: normalizeHref(category, slug),
      categoryHref,
      image: asset.image,
      width: asset.image.width,
      height: asset.image.height,
      isSvg: asset.isSvg
    };
  });

  const unlistedPhotos: GalleryPhoto[] = Array.from(imageMap.values())
    .filter((asset) => !usedFiles.has(asset.file))
    .sort(sortByFileName)
    .map((asset): GalleryPhoto => {
      const baseSlug = photoSlugFromFile(asset.file);
      let slug = baseSlug;
      let suffix = 2;

      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }

      usedSlugs.add(slug);

      return {
        category,
        categoryTitle: title,
        file: asset.file,
        slug,
        alt: "",
        caption: "",
        details: "",
        href: normalizeHref(category, slug),
        categoryHref,
        image: asset.image,
        width: asset.image.width,
        height: asset.image.height,
        isSvg: asset.isSvg
      };
    });

  const allPhotos: GalleryPhoto[] = [...photos, ...unlistedPhotos];

  allPhotos.forEach((photo, index) => {
    photo.previousHref = allPhotos[index - 1]?.href;
    photo.nextHref = allPhotos[index + 1]?.href;
  });

  return {
    slug: category,
    title,
    order: config.order ?? 999,
    href: categoryHref,
    photos: allPhotos
  };
}

export function getSiteContent(): SiteContent {
  return siteContent;
}

export function getGalleries(): Gallery[] {
  const slugs = new Set<string>([
    ...Array.from(galleryConfigs.keys()),
    ...Array.from(imagesByCategory.keys())
  ]);

  return Array.from(slugs)
    .map(buildGallery)
    .filter((gallery) => gallery.photos.length > 0)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getGallery(slug: string): Gallery | undefined {
  return getGalleries().find((gallery) => gallery.slug === slug);
}

export function getAllPhotos(): GalleryPhoto[] {
  return getGalleries().flatMap((gallery) => gallery.photos);
}

export function getPhotoByRef(ref: PhotoRef): GalleryPhoto | undefined {
  return getGallery(ref.category)?.photos.find((photo) => photo.slug === ref.slug);
}
