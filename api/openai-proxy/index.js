/**
 * Azure Function: Azure OpenAI Proxy
 * 
 * This function acts as a secure proxy for Azure OpenAI API calls.
 * The API key is stored server-side and never exposed to the client.
 * 
 * Environment Variables Required:
 *   - AZURE_OPENAI_ENDPOINT: Your Azure OpenAI endpoint URL
 *   - AZURE_OPENAI_KEY: Your Azure OpenAI API key (KEEP SECRET!)
 *   - AZURE_OPENAI_DEPLOYMENT: Your deployment name
 */

const ALLOWED_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:19006",
  "https://streetsweeper.azurewebsites.net",
  // Add your production domain here
];

function getCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function run(context, req) {
  const origin = req.headers?.origin || "";

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    context.res = {
      status: 204,
      headers: getCorsHeaders(origin),
    };
    return;
  }

  try {
    const { messages, temperature = 0 } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      context.res = {
        status: 400,
        body: { error: "Missing or invalid 'messages' in request body" },
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      };
      return;
    }

    // Get secrets from environment variables (configured in Azure Portal)
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

    if (!endpoint || !apiKey || !deployment) {
      context.log.error("Missing Azure OpenAI environment variables");
      context.res = {
        status: 500,
        body: { error: "Server configuration error" },
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      };
      return;
    }

    // Call Azure OpenAI
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        model: deployment,
        messages,
        temperature,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      context.log.error("Azure OpenAI error:", data);
      context.res = {
        status: response.status,
        body: { error: "OpenAI request failed", details: data.error?.message || "Unknown error" },
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      };
      return;
    }

    context.res = {
      status: 200,
      body: data,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    };
  } catch (err) {
    context.log.error("OpenAI proxy error:", err);
    context.res = {
      status: 500,
      body: { error: "Internal server error" },
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    };
  }
}
