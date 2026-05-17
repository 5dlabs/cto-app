import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

async function execute(code) {
  const raw = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const value = raw.result ?? raw.value ?? raw;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

const initial = await execute(`(() => JSON.stringify({
  heading: document.querySelector('h1')?.textContent?.trim() ?? null,
  sourcePanel: Boolean(document.querySelector('[data-testid="source-install-github"]')),
  sourceInstallGithub: Boolean(document.querySelector('[data-testid="source-install-github"]')),
  sourceInstallGitlab: Boolean(document.querySelector('[data-testid="source-install-gitlab"]')),
  sourceInstallGitea: Boolean(document.querySelector('[data-testid="source-install-gitea"]')),
  sourceInstallGitlabCto: Boolean(document.querySelector('[data-testid="source-install-gitlab-cto"]')),
  sourceProviderGithubLegacy: Boolean(document.querySelector('[data-testid="source-provider-github"]')),
  sourceProviderGitlabLegacy: Boolean(document.querySelector('[data-testid="source-provider-gitlab"]')),
  githubLabel: document.querySelector('[data-testid="source-install-github"]')?.textContent?.trim() ?? null,
  gitlabLabel: document.querySelector('[data-testid="source-install-gitlab"]')?.textContent?.trim() ?? null,
  giteaLabel: document.querySelector('[data-testid="source-install-gitea"]')?.textContent?.trim() ?? null,
  ctoGitlabLabel: document.querySelector('[data-testid="source-install-gitlab-cto"]')?.textContent?.trim() ?? null,
  iconFirstCards: document.querySelectorAll('.local-bootstrap__auth-choice--icon-first').length,
  installActionBadges: document.querySelectorAll('.local-bootstrap__install-action').length,
  topText: document.body.innerText.slice(0, 1600),
}))()`);
console.log('initial', JSON.stringify(initial));

if (!initial.sourceInstallGithub || !initial.sourceInstallGitlab || !initial.sourceInstallGitea || !initial.sourceInstallGitlabCto) {
  throw new Error('Missing one or more Source install actions in live desktop app');
}
if (/Installed Morgan|Installed GitLab/i.test(initial.topText)) {
  throw new Error('Past-tense Installed copy is visible in live Source screen');
}
if (initial.githubLabel !== 'GitHubgithub.com' || initial.gitlabLabel !== 'GitLabgitlab.com' || initial.giteaLabel !== 'Giteaexisting instance' || initial.ctoGitlabLabel !== 'CTO GitLabself-hosted') {
  throw new Error(`Visible Source labels are too verbose or unexpected: ${JSON.stringify(initial)}`);
}
if (initial.iconFirstCards !== 4 || initial.installActionBadges !== 4) {
  throw new Error(`Source install actions should render four icon-first cards with install badges: ${JSON.stringify(initial)}`);
}

for (const [testId, expected] of [
  ['source-install-github', { label: 'GitHubgithub.com' }],
  ['source-install-gitlab', { label: 'GitLabgitlab.com' }],
  ['source-install-gitea', { label: 'Giteaexisting instance' }],
  ['source-install-gitlab-cto', { label: 'CTO GitLabself-hosted', ctoMessage: true }],
]) {
  const clicked = await execute(`(() => {
    const button = document.querySelector('[data-testid="${testId}"]');
    button?.click();
    return JSON.stringify({ clicked: Boolean(button), label: button?.textContent?.trim() ?? null });
  })()`);
  console.log('clicked', testId, JSON.stringify(clicked));
  if (!clicked.clicked) throw new Error(`Could not click ${testId}`);
  await new Promise((resolve) => setTimeout(resolve, 900));
  const snapshot = await execute(`(() => JSON.stringify({
    githubPanel: Boolean(document.querySelector('[data-testid="source-auth-github-panel"]')),
    gitlabPanel: Boolean(document.querySelector('[data-testid="source-auth-gitlab-panel"]')),
    githubSignIn: Boolean(document.querySelector('[data-testid="source-github-sign-in"]')),
    gitlabInstall: Boolean(document.querySelector('[data-testid="source-gitlab-install"]')),
    ctoDeploy: Boolean(document.querySelector('[data-testid="source-gitlab-deploy-now"]')),
    text: document.body.innerText.slice(0, 1800),
  }))()`);
  console.log('snapshot', testId, JSON.stringify(snapshot));
  if (clicked.label !== expected.label) {
    throw new Error(`${testId} visible label is unexpected: ${JSON.stringify(clicked)}`);
  }
  if (snapshot.githubPanel || snapshot.gitlabPanel || snapshot.githubSignIn || snapshot.gitlabInstall || snapshot.ctoDeploy) {
    throw new Error(`${testId} leaked advanced provider controls into the initial Source view: ${JSON.stringify(snapshot)}`);
  }
  if (testId !== 'source-install-github' && snapshot.githubSignIn) {
    throw new Error(`${testId} leaked GitHub sign-in controls`);
  }
  if (expected.ctoMessage && !/install GitLab on CTO/i.test(snapshot.text)) {
    throw new Error('Install GitLab on CTO path did not show CTO install copy');
  }
}

console.log('PASS live Source install actions verified');
socketClient.close?.();
process.exit(0);
