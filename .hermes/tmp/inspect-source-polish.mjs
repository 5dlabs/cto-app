import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

try {
  const result = await socketClient.sendCommand('execute_js', {
    window_label: 'main',
    code: `(() => {
      const visibleText = (el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            const text = node.textContent?.trim();
            if (!text) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const style = getComputedStyle(parent);
            const rect = parent.getBoundingClientRect();
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return NodeFilter.FILTER_REJECT;
            if ((rect.width <= 1 || rect.height <= 1) && parent.classList.contains('sr-only')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        const texts = [];
        while (walker.nextNode()) texts.push(walker.currentNode.textContent.trim());
        return texts;
      };
      const buttonInfo = (testid) => {
        const el = document.querySelector('[data-testid="' + testid + '"]');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          testid,
          ariaLabel: el.getAttribute('aria-label'),
          title: el.getAttribute('title'),
          textContent: el.textContent.trim(),
          visibleText: visibleText(el),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          opacity: style.opacity,
          filter: style.filter,
          visible: Boolean(rect.width || rect.height || el.getClientRects().length),
        };
      };
      const github = document.querySelector('[data-testid="source-install-github"]');
      if (github) github.click();
      const gitlab = document.querySelector('[data-testid="source-install-gitlab"]');
      const gitlabStyle = gitlab ? getComputedStyle(gitlab) : null;
      return {
        title: document.querySelector('h1')?.textContent?.trim() || null,
        savedAccess: buttonInfo('source-saved-access-use'),
        pasteToken: buttonInfo('source-saved-access-paste'),
        selectedSource: buttonInfo('source-install-github'),
        unselectedSource: gitlab ? {
          testid: 'source-install-gitlab',
          opacity: gitlabStyle.opacity,
          filter: gitlabStyle.filter,
          transform: gitlabStyle.transform,
          visible: Boolean(gitlab.offsetWidth || gitlab.offsetHeight || gitlab.getClientRects().length),
        } : null,
        bodyHasVisibleUseSavedAccess: visibleText(document.body).includes('Use saved access'),
        bodyHasVisiblePasteInstead: visibleText(document.body).includes('Paste instead'),
      };
    })()`,
  });
  console.log(JSON.stringify(result.result ?? result.content ?? result, null, 2));
} finally {
  socketClient.client?.destroy?.();
  process.exit(0);
}
