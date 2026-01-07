export async function run(context, req) {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      context.res = {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        }
      };
      return;
    }

    const query = req.query.data || req.body?.data;
    if (!query) {
      context.res = {
        status: 400,
        body: { error: "Missing 'data' query parameter" },
        headers: corsHeaders()
      };
      return;
    }

    const overpassUrl = "https://overpass.kumi.systems/api/interpreter";
    const url = `${overpassUrl}?data=${encodeURIComponent(query)}`;

    const response = await fetch(url);
    const text = await response.text();

    context.res = {
      status: response.status,
      body: text,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json"
      }
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: err.message },
      headers: corsHeaders()
    };
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "*"
  };
}
