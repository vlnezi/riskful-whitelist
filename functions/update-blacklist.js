exports.handler = async function (event) {
  try {
    const { Octokit } = await import('@octokit/rest');
    console.log('Raw event body:', event.body);

    if (!event.body) {
      console.log('Error: event.body is empty or undefined');
      return { statusCode: 400, body: JSON.stringify({ error: 'Empty request body' }) };
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON', details: parseError.message }) };
    }

    const { groupId, secret, action } = requestBody;
    console.log('Parsed groupId:', groupId, 'Secret:', secret, 'Action:', action);

    if (secret !== process.env.SECRET_KEY) {
      console.log('Secret mismatch. Expected:', process.env.SECRET_KEY);
      return { statusCode: 403, body: JSON.stringify({ error: 'Wrong secret' }) };
    }

    if (!groupId || isNaN(groupId)) {
      console.log('Invalid groupId:', groupId);
      return { statusCode: 400, body: JSON.stringify({ error: 'Bad group ID' }) };
    }

    if (!['add', 'remove'].includes(action)) {
      console.log('Invalid action:', action);
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
    }

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = 'vlnezi';
    const repo = 'riskful-whitelist';
    const path = 'blacklist.html';

    console.log('Fetching GitHub file:', owner, repo, path);
    let fileData;
    try {
      const response = await octokit.repos.getContent({ owner, repo, path });
      fileData = response.data;
    } catch (githubError) {
      if (githubError.status === 404) {
        console.log('blacklist.html not found, creating new file');
        fileData = { sha: null, content: Buffer.from('<!DOCTYPE html><html><body><pre id="raw-data">\n</pre></body></html>').toString('base64') };
      } else {
        console.error('GitHub getContent error:', githubError.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch blacklist.html from GitHub', details: githubError.message }) };
      }
    }

    let html = Buffer.from(fileData.content, 'base64').toString('utf8');
    console.log('Fetched HTML:', html.slice(0, 100) + '...');

    const start = html.indexOf('<pre id="raw-data">\n') + 19;
    const end = html.indexOf('</pre>', start);
    if (start === -1 || end === -1) {
      console.error('Parsing error: <pre id="raw-data"> not found or malformed');
      return { statusCode: 500, body: JSON.stringify({ error: 'Invalid blacklist.html format' }) };
    }
    let rawData = html.slice(start, end).trim();
    let groupIds = rawData.split('\n').map(id => parseInt(id)).filter(id => !isNaN(id));
    console.log('Current group IDs:', groupIds);

    if (action === 'add') {
      if (groupIds.includes(groupId)) {
        console.log('Group ID already exists:', groupId);
        return { statusCode: 200, body: JSON.stringify({ message: 'Group ID already added' }) };
      }
      groupIds.push(groupId);
    } else if (action === 'remove') {
      if (!groupIds.includes(groupId)) {
        console.log('Group ID not found:', groupId);
        return { statusCode: 200, body: JSON.stringify({ message: 'Group ID not in blacklist' }) };
      }
      groupIds = groupIds.filter(id => id !== groupId);
    }

    rawData = groupIds.join('\n');
    html = html.slice(0, start) + rawData + '\n' + html.slice(end);
    console.log('Updated group IDs:', groupIds);

    console.log('Updating GitHub file');
    try {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `${action === 'add' ? 'Add' : 'Remove'} group ID ${groupId} to blacklist`,
        content: Buffer.from(html).toString('base64'),
        sha: fileData.sha,
      });
      console.log('GitHub file updated');
    } catch (githubError) {
      console.error('GitHub update error:', githubError.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update blacklist.html on GitHub', details: githubError.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ message: `Group ID ${action === 'add' ? 'added to' : 'removed from'} blacklist` }) };
  } catch (error) {
    console.error('Function error:', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Something broke', details: error.message }) };
  }
};
