import { defineCollection, z } from "astro:content";

const galleries = defineCollection({
  type: "data",
  schema: z.object({
    title: z.string().optional(),
    order: z.number().optional(),
    photos: z
      .array(
        z.object({
          file: z.string(),
          slug: z.string().optional(),
          alt: z.string().optional(),
          caption: z.string().optional(),
          details: z.string().optional()
        })
      )
      .optional()
  })
});

export const collections = { galleries };
