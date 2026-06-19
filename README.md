# Ray Emilio Photography

Static Astro remake of the photography portfolio. The site is intentionally file-based: add folders and images, update the adjacent JSON, commit, and deploy.

## Content Structure

Gallery folders live in `src/content/galleries/`.

```text
src/content/galleries/
  landscape/
    gallery.json
    image-01.jpg
  architecture/
    gallery.json
    image-01.jpg
```

Each folder becomes a public route. For example, `src/content/galleries/landscape/` builds `/landscape/`.

`gallery.json` controls title, order, captions, and photo order:

```json
{
  "title": "Landscape",
  "order": 1,
  "photos": [
    {
      "file": "image-01.jpg",
      "slug": "image-01",
      "alt": "Short visual description",
      "caption": "Caption text",
      "details": "Optional date, location, medium, or edition info"
    }
  ]
}
```

Images in the folder but not listed in JSON still appear at the end of the gallery with empty metadata. JSON entries that point to missing files fail the build.

## Commands

```bash
npm run dev
npm run check
npm run validate:photos
npm run build
```

`npm run validate:photos` reports missing alt/caption text and source files over 500 KB without blocking the early content workflow.
