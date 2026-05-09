export type LinkedinProfile = {
  full_name: string;
  headline: string;
  summary: string;
  occupation: string;
  city: string;
  country: string;
  experiences: Array<{
    title: string;
    company: string;
    starts_at?: { year: number; month: number };
    ends_at?: { year: number; month: number } | null;
  }>;
  education: Array<{
    school: string;
    degree_name: string;
    field_of_study: string;
  }>;
  public_identifier: string;
};

export class LinkedinNotFoundError extends Error {
  constructor(query: string) {
    super(`LinkedIn profile not found for: ${query}`);
    this.name = "LinkedinNotFoundError";
  }
}

export class LinkedinUnconfiguredError extends Error {
  constructor() {
    super("PROXYCURL_API_KEY is not configured");
    this.name = "LinkedinUnconfiguredError";
  }
}

let unconfiguredLogged = false;

export async function linkedinEnrich(input: {
  name: string;
  company?: string;
  email?: string;
  linkedinUrl?: string;
}): Promise<LinkedinProfile | null> {
  const apiKey = process.env.PROXYCURL_API_KEY;
  if (!apiKey) {
    if (!unconfiguredLogged) {
      console.warn("[linkedin-enrich] PROXYCURL_API_KEY not configured, skipping enrichment");
      unconfiguredLogged = true;
    }
    return null;
  }

  try {
    let profileUrl = input.linkedinUrl;

    if (!profileUrl) {
      const lookupParams = new URLSearchParams();
      lookupParams.set("first_name", input.name.split(" ")[0] || input.name);
      if (input.name.includes(" ")) {
        lookupParams.set("last_name", input.name.split(" ").slice(1).join(" "));
      }
      if (input.company) lookupParams.set("company_name", input.company);
      if (input.email) lookupParams.set("email", input.email);
      lookupParams.set("enrich_profile", "skip");

      const lookupResp = await fetch(
        `https://nubela.co/proxycurl/api/linkedin/profile/resolve?${lookupParams}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );

      if (!lookupResp.ok) {
        if (lookupResp.status === 404) return null;
        console.warn(`[linkedin-enrich] Lookup failed: ${lookupResp.status}`);
        return null;
      }

      const lookupData = await lookupResp.json();
      profileUrl = lookupData.url ?? lookupData.linkedin_profile_url;
      if (!profileUrl) return null;
    }

    const params = new URLSearchParams();
    params.set("url", profileUrl);
    params.set("fallback_to_cache", "on-error");
    params.set("use_cache", "if-present");
    params.set("skills", "exclude");
    params.set("inferred_salary", "exclude");
    params.set("personal_email", "exclude");
    params.set("personal_contact_number", "exclude");

    const resp = await fetch(
      `https://nubela.co/proxycurl/api/v2/linkedin?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (!resp.ok) {
      if (resp.status === 404) return null;
      console.warn(`[linkedin-enrich] Profile fetch failed: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    return {
      full_name: data.full_name ?? input.name,
      headline: data.headline ?? "",
      summary: data.summary ?? "",
      occupation: data.occupation ?? "",
      city: data.city ?? "",
      country: data.country_full_name ?? "",
      experiences: (data.experiences ?? []).slice(0, 5).map((e: any) => ({
        title: e.title ?? "",
        company: e.company ?? "",
        starts_at: e.starts_at,
        ends_at: e.ends_at,
      })),
      education: (data.education ?? []).slice(0, 3).map((e: any) => ({
        school: e.school ?? "",
        degree_name: e.degree_name ?? "",
        field_of_study: e.field_of_study ?? "",
      })),
      public_identifier: data.public_identifier ?? "",
    };
  } catch (error) {
    console.warn("[linkedin-enrich] Error:", error instanceof Error ? error.message : error);
    return null;
  }
}

export function resetLinkedinLogState() {
  unconfiguredLogged = false;
}
