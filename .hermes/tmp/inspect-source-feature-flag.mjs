import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

try {
  const result = await socketClient.sendCommand('execute_js', {
    window_label: 'main',
    code: `(() => {
      const buttons = [...document.querySelectorAll('button')].map((button) => ({
        testid: button.getAttribute('data-testid'),
        label: button.getAttribute('aria-label') || button.textContent?.trim() || '',
        visible: Boolean(button.offsetWidth || button.offsetHeight || button.getClientRects().length),
      }));
      return {
        title: document.querySelector('h1')?.textContent?.trim() || null,
        sourceButtons: buttons.filter((button) => button.testid?.startsWith('source-')),
        bodyIncludes5DOrigin: document.body.textContent?.includes('5D Origin') ?? false,
        sourceInstall5DOriginVisible: buttons.some((button) => button.testid === 'source-install-5d-origin' && button.visible),
        githubVisible: buttons.some((button) => button.testid === 'source-install-github' && button.visible),
        gitlabVisible: buttons.some((button) => button.testid === 'source-install-gitlab' && button.visible),
      };
    })()`,
  });
  console.log(JSON.stringify(result.result ?? result.content ?? result, null, 2));
} finally {
  socketClient.client?.destroy?.();
  process.exit(0);
}
