import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cloudflare API routing configuration", () => {
  it("runs every API navigation through the Worker before the SPA fallback", () => {
    const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    expect(config).toMatch(/"run_worker_first"\s*:\s*\[\s*"\/api\/\*"\s*\]/);
  });

  it("declares hourly security maintenance in every deployable environment", () => {
    const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    expect(config.split('"0 * * * *"')).toHaveLength(4);
  });
});
