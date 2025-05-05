exports.handler = async function (event) {
  try {
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

    if (!groupId || isNaN(groupId) || groupId <= 0) {
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
      // If file doesn't exist, initialize it
      if (githubError.status === 404) {
        console.log('whitelist.html not found, creating new file');
        const defaultHtml = `<!DOCTYPE html>\n<html>\n<body>\n<pre id="raw-data">\n</pre>\n</body>\n</html>`;
        try {
          await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: 'Initialize whitelist.html',
            content: Buffer.from(defaultHtml).toString('base64'),
          });
          fileData = {
            content: Buffer.from(defaultHtml).toString('base64'),
            sha: null, // Will be set on next update
          };
        } catch (createError) {
          console.error('Failed to create whitelist.html:', createError.message);
          return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create whitelist.html', details: createError.message }) };
        }
      } else {
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch whitelist.html from GitHub', details: githubError.message }) };
      }
    }

    // Decode file content
    let html = Buffer.from(fileData.content, 'base64').toString('utf8');
    console.log('Fetched HTML:', html.slice(0, 100) + '...');

    // Define tags for parsing
    const startTag = '<pre id="raw-data">\n';
    const endTag = '</pre>';
    const start = html.indexOf(startTag);
    const end = html.indexOf(endTag, start);

    let groupIds = [];
    let updatedHtml;

    // Check if HTML is malformed or missing <pre id="raw-data">
    if (start === -1 || end === -1) {
      console.warn('Invalid HTML structure, attempting to repair');
      // Extract numeric IDs from the file
      const lines = html.split('\n').map(line => line.trim()).filter(line => /^\d+$/.test(line));
      groupIds = lines.map(id => parseInt(id)).filter(id => !isNaN(id));
      console.log('Extracted group IDs from malformed HTML:', groupIds);

      // Create a new valid HTML structure
      const newRawData = groupIds.length > 0 ? groupIds.join('\n') + '\n' : '';
      updatedHtml = `<!DOCTYPE html>\n<html>\n<body>\n<pre id="raw-data">\n${newRawData}</pre>\n</body>\n</html>`;
    } else {
      // Extract existing group IDs
      const rawData = html.slice(start + startTag.length, end).trim();
      groupIds = rawData.split('\n').map(id => parseInt(id)).filter(id => !isNaN(id));
      console.log('Current group IDs:', groupIds);

      // Create updated raw data
      if (!groupIds.includes(groupId)) {
        groupIds.push(groupId);
      }
      const updatedRawData = groupIds.join('\n') + '\n';

      // Reconstruct HTML
      updatedHtml = html.slice(0, start + startTag.length) + updatedRawData + html.slice(end);
    }

    // Update GitHub repository
    console.log('Updating GitHub file with new HTML:', updatedHtml.slice(0, 200) + '...');
    try {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `Add group ID ${groupId}`,
        content: Buffer.from(updatedHtml).toString('base64'),
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
