// functions/list-whitelist.js

exports.handler = async function (event) {
  try {
    const { Octokit } = await import("@octokit/rest");

    // Only allow POST
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    // Parse body
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: "Empty body" }) };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
    }

    const { secret } = body;

    if (secret !== process.env.SECRET_KEY) {
      return { statusCode: 403, body: JSON.stringify({ error: "Invalid secret" }) };
    }

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const owner = "vlnezi";
    const repo = "riskful-whitelist";
    const path = "whitelist.json";  // ← changed to JSON!

    let response;
    try {
      response = await octokit.repos.getContent({ owner, repo, path });
    } catch (err) {
      if (err.status === 404) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ whitelist: [] })
        };
      }
      throw err;
    }

    const content = Buffer.from(response.data.content, "base64").toString("utf-8");
    let data;

    try {
      data = JSON.parse(content);
    } catch {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Invalid JSON in whitelist.json" })
      };
    }

    let groupIds = [];

    // Support both formats: array directly or { groups: [...] }
    if (Array.isArray(data)) {
      groupIds = data;
    } else if (data && Array.isArray(data.groups)) {
      groupIds = data.groups;
    }

    // Clean & validate
    groupIds = groupIds
      .map(id => parseInt(id, 10))
      .filter(id => Number.isSafeInteger(id) && id > 0);

    // Deduplicate + sort (optional)
    groupIds = [...new Set(groupIds)].sort((a, b) => a - b);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whitelist: groupIds })
    };

  } catch (error) {
    console.error("list-whitelist error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message
      })
    };
  }
};
