/**
 * Azure Function: Strava Token Exchange
 * 
 * This function securely exchanges Strava OAuth authorization codes for access tokens.
 * The client secret is stored server-side and never exposed to the client.
 * 
 * Environment Variables Required:
 *   - STRAVA_CLIENT_ID: Your Strava app client ID
 *   - STRAVA_CLIENT_SECRET: Your Strava app client secret
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
    const { code } = req.body || {};

    if (!code) {
      context.res = {
        status: 400,
        body: { error: "Missing 'code' in request body" },
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      };
      return;
    }

    // Get secrets from environment variables (configured in Azure Portal)
    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      context.log.error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET environment variables");
      context.res = {
        status: 500,
        body: { error: "Server configuration error" },
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      };
      return;
    }

    // Exchange the authorization code for an access token
    const tokenUrl = "https://www.strava.com/oauth/token";
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      context.log.error("Strava token exchange failed:", data);
      context.res = {
        status: 401,
        body: { error: "Token exchange failed", details: data.message || "Unknown error" },
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      };
      return;
    }

    // Return only the access token (don't expose refresh token to client)
    context.res = {
      status: 200,
      body: { access_token: data.access_token, expires_at: data.expires_at },
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    };
  } catch (err) {
    context.log.error("Strava token exchange error:", err);
    context.res = {
      status: 500,
      body: { error: "Internal server error" },
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    };
  }
}
