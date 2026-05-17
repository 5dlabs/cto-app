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
  shell: Boolean(document.querySelector('[data-testid="morgan-conversation-shell"]')),
  turn: document.querySelector('[data-testid="morgan-conversation-shell"]')?.getAttribute('data-turn') ?? null,
  prompt: document.querySelector('.local-bootstrap__decision-card strong')?.textContent?.trim() ?? null,
  sourceCards: [
    'source-install-github',
    'source-install-gitlab',
    'source-install-gitea',
    'source-install-gitlab-cto',
  ].map((id) => ({ id, present: Boolean(document.querySelector('[data-testid="' + id + '"]')) })),
  advancedLeak: Boolean(document.querySelector('[data-testid="source-auth-github-panel"], [data-testid="source-auth-gitlab-panel"], [data-testid="source-github-sign-in"], [data-testid="source-gitlab-install"], [data-testid="source-gitlab-deploy-now"]')),
  text: document.body.innerText.slice(0, 1600),
}))()`);
console.log('initial', JSON.stringify(initial));

if (!initial.shell) throw new Error('Missing Morgan conversation shell in live desktop app');
if (initial.prompt !== 'Install me on your environment.') throw new Error(`Unexpected Morgan prompt: ${initial.prompt}`);
for (const card of initial.sourceCards) {
  if (!card.present) throw new Error(`Missing Source decision card ${card.id}`);
}
if (initial.advancedLeak) throw new Error(`Initial Source shell leaked advanced auth controls: ${JSON.stringify(initial)}`);

const beforeTurn = Number(initial.turn ?? 0);
const clicked = await execute(`(() => {
  const button = document.querySelector('[data-testid="source-install-gitea"]');
  button?.click();
  return JSON.stringify({ clicked: Boolean(button), label: button?.textContent?.trim() ?? null });
})()`);
console.log('clicked', JSON.stringify(clicked));
if (!clicked.clicked) throw new Error('Could not click Gitea Source decision card');

await new Promise((resolve) => setTimeout(resolve, 900));

const after = await execute(`(() => JSON.stringify({
  turn: Number(document.querySelector('[data-testid="morgan-conversation-shell"]')?.getAttribute('data-turn') ?? '0'),
  banner: Array.from(document.querySelectorAll('body *')).map((el) => el.textContent || '').find((text) => /Install Morgan on Gitea selected/i.test(text)) ?? null,
  text: document.body.innerText.slice(0, 1800),
  giteaUrlVisible: /GITEA URL/i.test(document.body.innerText),
  advancedLeak: Boolean(document.querySelector('[data-testid="source-auth-github-panel"], [data-testid="source-auth-gitlab-panel"], [data-testid="source-github-sign-in"], [data-testid="source-gitlab-install"], [data-testid="source-gitlab-deploy-now"]')),
}))()`);
console.log('after', JSON.stringify(after));

if (after.turn <= beforeTurn) throw new Error(`Morgan conversation turn did not advance: before=${beforeTurn} after=${after.turn}`);
if (!/Install Morgan on Gitea selected/i.test(after.text)) throw new Error('Morgan did not acknowledge the Gitea selection');
if (!after.giteaUrlVisible) throw new Error('Gitea follow-up URL field did not appear after selecting Gitea');
if (after.advancedLeak) throw new Error(`Advanced provider controls leaked after Source selection: ${JSON.stringify(after)}`);

console.log('PASS live Morgan conversation shell verified');
socketClient.close?.();
process.exit(0);
