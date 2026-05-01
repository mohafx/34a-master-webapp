export type PostHogProperties = Record<string, unknown>;

export interface CapturePostHogOptions {
  distinctId?: string | null;
  properties?: PostHogProperties;
  set?: PostHogProperties;
}

const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";

export async function capturePostHog(
  event: string,
  distinctId?: string | null,
  properties: PostHogProperties = {},
): Promise<void> {
  await capturePostHogEvent(event, { distinctId, properties });
}

export async function capturePostHogEvent(
  event: string,
  options: CapturePostHogOptions = {},
): Promise<void> {
  const apiKey = Deno.env.get("POSTHOG_PROJECT_API_KEY");
  const host = (Deno.env.get("POSTHOG_HOST") || DEFAULT_POSTHOG_HOST).replace(/\/$/, "");

  if (!apiKey) {
    console.warn(`[posthog] Skipping ${event}: POSTHOG_PROJECT_API_KEY is not configured`);
    return;
  }

  const properties: PostHogProperties = {
    ...options.properties,
    source_type: "server",
    timestamp: new Date().toISOString(),
  };

  if (options.set && Object.keys(options.set).length > 0) {
    properties.$set = options.set;
  }

  try {
    const response = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: options.distinctId || "server",
        properties,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[posthog] Failed to capture ${event}: ${response.status} ${body}`);
    }
  } catch (error) {
    console.error(`[posthog] Failed to capture ${event}:`, error);
  }
}
