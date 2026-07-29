const ALLOWED_EVENTS = new Set(["PageView", "Contact", "Lead"]);

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

function cleanString(value, pattern, maxLength) {
  return typeof value === "string"
    ? value.replace(pattern, "").slice(0, maxLength)
    : "";
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { success: false, error: "Method not allowed." });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const graphVersion = process.env.META_GRAPH_VERSION || "v22.0";
  const testEventCode = process.env.META_TEST_EVENT_CODE || "";

  if (!pixelId || !accessToken) {
    return sendJson(response, 500, {
      success: false,
      error: "Meta CAPI environment variables are not configured."
    });
  }

  let input = request.body;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      return sendJson(response, 400, { success: false, error: "Invalid JSON payload." });
    }
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return sendJson(response, 400, { success: false, error: "Invalid JSON payload." });
  }

  const eventName = cleanString(input.event_name, /[^A-Za-z0-9_]/g, 80);
  if (!ALLOWED_EVENTS.has(eventName)) {
    return sendJson(response, 400, { success: false, error: "Unsupported event name." });
  }

  const eventId =
    cleanString(input.event_id, /[^A-Za-z0-9_.-]/g, 120) ||
    `${eventName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  let eventSourceUrl = "";
  if (typeof input.event_source_url === "string") {
    try {
      const parsedUrl = new URL(input.event_source_url);
      if (parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:") {
        eventSourceUrl = parsedUrl.toString().slice(0, 2048);
      }
    } catch {
      // Meta accepts an empty source URL less reliably, so fall back below.
    }
  }

  if (!eventSourceUrl) {
    const protocol = firstHeaderValue(request.headers["x-forwarded-proto"]) || "https";
    const host = firstHeaderValue(request.headers["x-forwarded-host"] || request.headers.host);
    eventSourceUrl = host ? `${protocol}://${host}/` : "";
  }

  const userData = {
    client_ip_address: firstHeaderValue(
      request.headers["x-forwarded-for"] || request.socket?.remoteAddress
    ),
    client_user_agent: String(request.headers["user-agent"] || "").slice(0, 1000)
  };

  const fbp = cleanString(input.fbp, /[\u0000-\u001F\u007F]/g, 200);
  const fbc = cleanString(input.fbc, /[\u0000-\u001F\u007F]/g, 200);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: eventSourceUrl,
        user_data: userData
      }
    ]
  };

  if (testEventCode) payload.test_event_code = testEventCode;

  const metaUrl = new URL(
    `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(pixelId)}/events`
  );
  metaUrl.searchParams.set("access_token", accessToken);

  try {
    const metaResponse = await fetch(metaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    const metaBody = await metaResponse.json().catch(() => null);

    return sendJson(response, metaResponse.ok ? 200 : 502, {
      success: metaResponse.ok,
      http_code: metaResponse.status,
      meta_response: metaBody
    });
  } catch (error) {
    return sendJson(response, 502, {
      success: false,
      error: error instanceof Error ? error.message : "Meta request failed."
    });
  }
}
