// functions/list-whitelist.js
// NEW endpoint: returns all whitelisted group IDs
// POST { secret } → { whitelist: [] }

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method Not Allowed" });
    }

    const body = JSON.parse(event.body || "{}");
    const { secret } = body;

    // same secret your bot already uses
    if (!process.env.NETLIFY_SECRET || secret !== process.env.NETLIFY_SECRET) {
      return json(401, { error: "Unauthorized" });
    }

    // read from the SAME store used by update-whitelist
    const store = getStore("riskful-whitelist");
    const whitelist = (await store.get("groups", { type: "json" })) || [];

    return json(200, { whitelist });
  } catch (err) {
    return json(500, { error: err.message || "Server error" });
  }
};

function json(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
