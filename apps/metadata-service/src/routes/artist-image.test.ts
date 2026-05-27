import { describe, it, expect } from "vitest";
import { ArtistUrlRelsSchema, WikidataEntitySchema } from "./artist-image.js";

describe("ArtistUrlRelsSchema", () => {
  it("accepts a response with a wikidata relation", () => {
    const result = ArtistUrlRelsSchema.safeParse({
      relations: [
        {
          type: "wikidata",
          url: { resource: "https://www.wikidata.org/wiki/Q123" },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a response with no relations field", () => {
    const result = ArtistUrlRelsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects a relation missing url.resource", () => {
    const result = ArtistUrlRelsSchema.safeParse({
      relations: [{ type: "wikidata", url: {} }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a relation where type is not a string", () => {
    const result = ArtistUrlRelsSchema.safeParse({
      relations: [{ type: 42, url: { resource: "https://..." } }],
    });
    expect(result.success).toBe(false);
  });
});

describe("WikidataEntitySchema", () => {
  it("accepts a valid entity with a P18 image claim", () => {
    const result = WikidataEntitySchema.safeParse({
      entities: {
        Q123: {
          claims: {
            P18: [{ mainsnak: { datavalue: { value: "Image.jpg" } } }],
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an entity with no claims field", () => {
    const result = WikidataEntitySchema.safeParse({
      entities: { Q123: {} },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a P18 claim with no datavalue", () => {
    const result = WikidataEntitySchema.safeParse({
      entities: {
        Q123: {
          claims: {
            P18: [{ mainsnak: {} }],
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response missing the entities key", () => {
    const result = WikidataEntitySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a P18 entry where datavalue.value is not a string", () => {
    const result = WikidataEntitySchema.safeParse({
      entities: {
        Q123: {
          claims: {
            P18: [{ mainsnak: { datavalue: { value: 42 } } }],
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
