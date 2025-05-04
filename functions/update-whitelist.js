const fs = require('fs').promises;
const path = require('path');
const { Octokit } = require('@octokit/rest');

exports.handler = async function (event) {
  try {
    const { groupId, secret } = JSON.parse(event.body);
    if (secret !== process.env.SECRET_KEY) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Wrong secret' }) };
    }
    if (!groupId || isNaN(groupId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Bad group ID' }) };
    }

    const filePath = path.join(__dirname, '../whitelist.html');
    let html = await fs.readFile(filePath, 'utf8');
    const start = html.indexOf('<pre id="raw-data">\n') + 19;
    const end = html.indexOf('</pre>', start);
    let rawData = html.slice(start, end).trim();
    let groupIds = rawData.split('\n').map(id => parseInt(id)).filter(id => !isNaN(id));

    if (groupIds.includes(groupId)) {
      return { statusCode: 200, body: JSON.stringify({ message: 'Group ID already added' }) };
    }
    groupIds.push(groupId);
    rawData = groupIds.join('\n');

    html = html.slice(0, start) + rawData + '\n' + html.slice(end);
    await fs.writeFile(filePath, html);

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = 'vlnezi';
    const repo = 'riskful-whitelist';
    const { data: fileData } = await octokit.repos.getContent({
      owner,
      repo,
      path: 'whitelist.html',
    });

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'whitelist.html',
      message: `Add group ID ${groupId}`,
      content: Buffer.from(html).toString('base64'),
      sha: fileData.sha,
    });

    return { statusCode: 200, body: JSON.stringify({ message: 'Whitelist updated' }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Something broke' }) };
  }
};
