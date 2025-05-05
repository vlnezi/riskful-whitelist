const fs = require('fs').promises;
const path = require('path');

exports.handler = async function (event) {
  try {
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

    // Read whitelist.html
    const filePath = path.join(__dirname, '../whitelist.html');
    console.log('Reading file:', filePath);
    let html;
    try {
      html = await fs.readFile(filePath, 'utf8');
    } catch (fileError) {
      console.error('File read error:', fileError.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to read whitelist.html', details: fileError.message }) };
    }

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

    // Write updated HTML
    try {
      await fs.writeFile(filePath, html);
      console.log('Wrote updated whitelist.html');
    } catch (fileError) {
      console.error('File write error:', fileError.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to write whitelist.html', details: fileError.message }) };
    }

    // Update GitHub repository
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = 'vlnezi';
    const repo = 'riskful-whitelist';
    console.log('Fetching GitHub file:', owner, repo, 'whitelist.html');
    let fileData;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: 'whitelist.html',
      });
      fileData = response.data;
    } catch (githubError) {
      console.error('GitHub getContent error:', githubError.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch whitelist.html from GitHub', details: githubError.message }) };
    }

    console.log('Updating GitHub file');
    try {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'whitelist.html',
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
