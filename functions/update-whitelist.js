const axios = require('axios');

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
    if (requestBody.reset) {
      const defaultHtml = `<!-- Raw data for the script, hidden from browser view -->\n<pre id="raw-data">\n</pre>\n</body>\n</html>`;
      try {
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        await octokit.repos.createOrUpdateFileContents({
          owner: 'vlnezi',
          repo: 'riskful-whitelist',
          path: 'whitelist.html',
          message: 'Reset whitelist.html',
          content: Buffer.from(defaultHtml, 'utf8').toString('base64'),
          sha: null,
        });
        console.log('Whitelist reset to:', JSON.stringify(defaultHtml));
        return { statusCode: 200, body: JSON.stringify({ message: 'Whitelist reset' }) };
      } catch (error) {
        console.error('Reset error:', error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to reset whitelist', details: error.message }) };
      }
    }
    const { groupId, removeGroupId, secret } = requestBody;
    console.log('Parsed groupId:', groupId, 'removeGroupId:', removeGroupId, 'Secret:', secret);
    if (secret !== process.env.SECRET_KEY) {
      console.log('Secret mismatch. Expected:', process.env.SECRET_KEY);
      return { statusCode: 403, body: JSON.stringify({ error: 'Wrong secret' }) };
    }
    const actionId = groupId || removeGroupId;
    if (!actionId || isNaN(actionId) || actionId < 0) {
      console.log('Invalid ID:', actionId);
      return { statusCode: 400, body: JSON.stringify({ error: 'Bad group ID' }) };
    }
    if (groupId) {
      try {
        const response = await axios.get(`https://groups.roblox.com/v1/groups/${groupId}`);
        if (!response.data || response.data.id !== groupId) {
          console.log('Invalid Roblox group ID:', groupId);
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Roblox group ID' }) };
        }
      } catch (error) {
        console.error('Roblox API error:', error.message);
        return { statusCode: 400, body: JSON.stringify({ error: 'Failed to validate group ID with Roblox API' }) };
      }
    }
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = 'vlnezi';
    const repo = 'riskful-whitelist';
    const path = 'whitelist.html';
    console.log('Fetching GitHub file:', owner, repo, path);
    let fileData;
    try {
      const response = await octokit.repos.getContent({ owner, repo, path });
      fileData = response.data;
    } catch (githubError) {
      console.error('GitHub getContent error:', githubError.message);
      if (githubError.status === 404) {
        console.log('whitelist.html not found, creating new file');
        const defaultHtml = `<!-- Raw data for the script, hidden from browser view -->\n<pre id="raw-data">\n</pre>\n</body>\n</html>`;
        try {
          await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: 'Initialize whitelist.html',
            content: Buffer.from(defaultHtml, 'utf8').toString('base64'),
          });
          fileData = { content: Buffer.from(defaultHtml, 'utf8').toString('base64'), sha: null };
        } catch (createError) {
          console.error('Failed to create whitelist.html:', createError.message);
          return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create whitelist.html', details: createError.message }) };
        }
      } else {
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch whitelist.html from GitHub', details: githubError.message }) };
      }
    }
    let html = Buffer.from(fileData.content, 'base64').toString('utf8');
    console.log('Fetched HTML (raw):', JSON.stringify(html));
    const startTag = '<pre id="raw-data">\n';
    const endTag = '</pre>';
    const start = html.indexOf(startTag);
    const end = html.indexOf(endTag, start);
    let groupIds = [];
    let updatedHtml;
    if (start === -1 || end === -1) {
      console.warn('Invalid HTML structure, attempting to repair');
      const lines = html.split('\n').map(line => line.trim()).filter(line => /^\d+$/.test(line));
      groupIds = lines.map(id => parseInt(id)).filter(id => !isNaN(id));
      console.log('Extracted group IDs from malformed HTML:', groupIds);
    } else {
      const rawData = html.slice(start + startTag.length, end).trim();
      const lines = rawData.split('\n').map(line => line.trim()).filter(line => line !== '');
      groupIds = lines.map(id => parseInt(id)).filter(id => !isNaN(id));
      console.log('Current group IDs (before action):', groupIds);
    }
    groupIds = [...new Set(groupIds)];
    console.log('Deduplicated group IDs:', groupIds);
    if (removeGroupId) {
      if (!groupIds.includes(removeGroupId)) {
        console.log('Group ID not found:', removeGroupId);
        return { statusCode: 400, body: JSON.stringify({ error: 'Group ID not found in whitelist' }) };
      }
      groupIds = groupIds.filter(id => id !== removeGroupId);
      console.log('Group IDs after removal:', groupIds);
    } else if (groupId) {
      if (!groupIds.includes(groupId)) {
        groupIds.push(groupId);
      }
      console.log('Group IDs after addition:', groupIds);
    }
    const updatedRawData = groupIds.length > 0 ? groupIds.join('\n') : '';
    updatedHtml = `<!-- Raw data for the script, hidden from browser view -->\n<pre id="raw-data">\n${updatedRawData}</pre>\n</body>\n</html>`;
    console.log('Updated HTML (raw):', JSON.stringify(updatedHtml));
    try {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: removeGroupId ? `Remove group ID ${removeGroupId}` : `Add group ID ${groupId}`,
        content: Buffer.from(updatedHtml, 'utf8').toString('base64'),
        sha: fileData.sha,
      });
      console.log('GitHub file updated');
    } catch (githubError) {
      console.error('GitHub update error:', githubError.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update whitelist.html on GitHub', details: githubError.message }) };
    }
    return { statusCode: 200, body: JSON.stringify({ message: removeGroupId ? 'Group ID removed' : 'Whitelist updated' }) };
  } catch (error) {
    console.error('Function error:', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Something broke', details: error.message }) };
  }
};
