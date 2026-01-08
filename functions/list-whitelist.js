// functions/list-whitelist.js
// POST { secret } -> { whitelist: [...] }

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method Not Allowed" });
    }

    const body = JSON.parse(event.body || "{}");
    const { secret } = body;

    // ✅ use the env var you already have in Netlify: SECRET_KEY
    const expected = process.env.SECRET_KEY;
    if (!expected || secret !== expected) {
      return json(401, { error: "Unauthorized" });
    }

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
