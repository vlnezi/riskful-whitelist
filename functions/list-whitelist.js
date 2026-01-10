// functions/list-whitelist.js
// Uses the SAME storage method as update-whitelist.js:
// Reads whitelist.html from GitHub and returns IDs from <pre id="raw-data"> ... </pre>
//
// POST { secret } -> { whitelist: [123,456,...] }

exports.handler = async function (event) {
  try {
    const { Octokit } = await import("@octokit/rest");

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Empty request body" }),
      };
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON", details: parseError.message }),
      };
    }

    const { secret } = requestBody;

    // ✅ same secret check style as your update function
    if (secret !== process.env.SECRET_KEY) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Wrong secret" }),
      };
    }

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const owner = "vlnezi";
    const repo = "riskful-whitelist";
    const path = "whitelist.html";

    let fileData;
    try {
      const response = await octokit.repos.getContent({ owner, repo, path });
      fileData = response.data;
    } catch (githubError) {
      // if file missing, treat as empty whitelist
      if (githubError.status === 404) {
        return {
          statusCode: 200,
          body: JSON.stringify({ whitelist: [] }),
        };
      }
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to fetch whitelist.html from GitHub",
          details: githubError.message,
        }),
      };
    }

    const html = Buffer.from(fileData.content, "base64").toString("utf8");

    const startTag = '<pre id="raw-data">\\n';
    const endTag = "</pre>";

    const start = html.indexOf(startTag);
    const end = html.indexOf(endTag, start);

    let groupIds = [];

    if (start === -1 || end === -1) {
      // Same “repair-ish” fallback idea: extract any lines that are just digits
      const lines = html
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+$/.test(line));

      groupIds = lines.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0);
    } else {
      const rawData = html.slice(start + startTag.length, end).trim();
      const lines = rawData
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");

      groupIds = lines.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0);
    }

    // dedupe + sort
    groupIds = Array.from(new Set(groupIds)).sort((a, b) => a - b);

    return {
      statusCode: 200,
      body: JSON.stringify({ whitelist: groupIds }),
      headers: { "Content-Type": "application/json" },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Something broke", details: error.message }),
    };
  }
};
