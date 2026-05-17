import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const raw = await socketClient.sendCommand('execute_js', {
  window_label: 'main',
  code: `(() => {
    const gitlab = document.querySelector('[data-testid="source-provider-gitlab"]');
    gitlab?.click();
    return JSON.stringify({ clicked: Boolean(gitlab) });
  })()`
});
console.log(raw.result ?? raw.value ?? raw);
await new Promise((resolve) => setTimeout(resolve, 1800));
const snapshot = await socketClient.sendCommand('execute_js', {
  window_label: 'main',
  code: `(() => JSON.stringify({
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    gitlabPanel: Boolean(document.querySelector('[data-testid="source-auth-gitlab-panel"]')),
    githubPanel: Boolean(document.querySelector('[data-testid="source-auth-github-panel"]')),
    deployNow: Boolean(document.querySelector('[data-testid="source-gitlab-deploy-now"]')),
    githubSignIn: Boolean(document.querySelector('[data-testid="source-github-sign-in"]')),
    text: document.body.innerText.slice(0, 1200),
  }))()`
});
console.log(snapshot.result ?? snapshot.value ?? snapshot);
process.exit(0);
