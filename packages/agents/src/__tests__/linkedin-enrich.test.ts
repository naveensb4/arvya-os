import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { linkedinEnrich, resetLinkedinLogState } from "../tools/linkedin-enrich";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  resetLinkedinLogState();
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("linkedinEnrich", () => {
  it("returns null gracefully when PROXYCURL_API_KEY is not set", async () => {
    delete process.env.PROXYCURL_API_KEY;

    const result = await linkedinEnrich({ name: "John Doe", company: "Acme" });

    expect(result).toBeNull();
  });

  it("resolves profile from name + company via lookup then full fetch", async () => {
    process.env.PROXYCURL_API_KEY = "test-key";

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // First call: profile resolve
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ url: "https://linkedin.com/in/johndoe" }),
        { status: 200 },
      ),
    );

    // Second call: full profile
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          full_name: "John Doe",
          headline: "CEO at Acme",
          summary: "Seasoned exec",
          occupation: "CEO",
          city: "SF",
          country_full_name: "US",
          experiences: [{ title: "CEO", company: "Acme", starts_at: { year: 2020, month: 1 } }],
          education: [{ school: "MIT", degree_name: "BS", field_of_study: "CS" }],
          public_identifier: "johndoe",
        }),
        { status: 200 },
      ),
    );

    const result = await linkedinEnrich({ name: "John Doe", company: "Acme" });

    expect(result).not.toBeNull();
    expect(result!.full_name).toBe("John Doe");
    expect(result!.headline).toBe("CEO at Acme");
    expect(result!.public_identifier).toBe("johndoe");
    expect(result!.experiences).toHaveLength(1);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const lookupUrl = fetchSpy.mock.calls[0][0] as string;
    expect(lookupUrl).toContain("resolve");
    expect(lookupUrl).toContain("first_name=John");
  });

  it("returns null on 404 without throwing", async () => {
    process.env.PROXYCURL_API_KEY = "test-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );

    const result = await linkedinEnrich({ name: "Nobody", company: "Nowhere" });
    expect(result).toBeNull();
  });
});
