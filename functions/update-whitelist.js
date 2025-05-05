exports.handler = async function (event) {
  try {
    // Dynamically import @octokit/rest
    const { Octokit } = await import('@octokit/rest');

    // Log raw event body
    console.log('Raw event body:', event.body);

    // Validate event.body
    if (!event.body) {
      console.log('Error: event.body is empty or undefined');
      return { statusCode: 400, body: JSON.stringify({ error: 'Empty request body' }) };
    }

    // Parse JSON
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON', details: parseError.message }) };
    }

    // Validate groupId and secret
    const { groupId, secret } = requestBody;
    console.log('Parsed groupId:', groupId, 'Secret:', secret);

    if (secret !== process.env.SECRET_KEY) {
      console.log('Secret mismatch. Expected:', process.env.SECRET_KEY);
      return { statusCode: 403, body: JSON.stringify({ error: 'Wrong secret' }) };
    }

    if (!groupId || isNaN(groupId)) {
      console.log('Invalid groupId:', groupId);
      return { statusCode: 400, body: JSON.stringify({ error: 'Bad group ID' }) };
    }

    // Initialize Octokit
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = 'vlnezi';
    const repo = 'riskful-whitelist';
    const path = 'whitelist.html';

    // Fetch whitelist.html from GitHub
    console.log('Fetching GitHub file:', owner, repo, path);
    let fileData;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
      });
      fileData = response.data;
    } catch (githubError) {
      console.error('GitHub getContent error:', githubError.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch whitelist.html from GitHub', details: githubError.message }) };
    }

    // Decode file content
    let html = Buffer.from(fileData.content, 'base64').toString('utf8');
    console.log('Fetched HTML:', html.slice(0, 100) + '...');

    // Parse HTML for group IDs
    const start = html.indexOf('<pre id="raw-data">\n') + 19;
    const end = html.indexOf('</pre>', start);
    if (start === -1 || end === -1) {
      console.error('Parsing error: <pre id="raw-data"> not found or malformed');
      return { statusCode: 500, body: JSON.stringify({ error: 'Invalid whitelist.html format' }) };
    }
    let rawData = html.slice(start, end).trim();
    let groupIds = rawData.split('\n').map(id => parseInt(id)).filter(id => !isNaN(id));
    console.log('Current group IDs:', groupIds);

    // Check if groupId exists
    if (groupIds.includes(groupId)) {
      console.log('Group ID already exists:', groupId);
      return { statusCode: 200, body: JSON.stringify({ message: 'Group ID already added' }) };
    }

    // Update group IDs
    groupIds.push(groupId);
    rawData = groupIds.join('\n');
    html = html.slice(0, start) + rawData + '\n' + html.slice(end);
    console.log('Updated group IDs:', groupIds);

    // Update GitHub repository
    console.log('Updating GitHub file');
    try {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `Add group ID ${groupId}`,
        content: Buffer.from(html).toString('base64'),
        sha: fileData.sha,
      });
      console.log('GitHub file updated');
    } catch (githubError) {
      console.error('GitHub update error:', githubError.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update whitelist.html on GitHub', details: githubError.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Whitelist updated' }) };
  } catch (error) {
    console.error('Function error:', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Something broke', details: error.message }) };
  }
};
