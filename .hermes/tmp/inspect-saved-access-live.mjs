#!/usr/bin/env node
import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";

let output;
try {
  const result = await socketClient.sendCommand("execute_js", {
    window_label: "main",
    code: `(() => {
      const heading = document.querySelector('h1')?.textContent ?? '';
      const modal = document.querySelector('[data-testid="saved-access-onepassword-modal"]');
      const readiness = document.querySelector('[data-testid="saved-access-readiness"]');
      const conditionAction = document.querySelector('[data-testid="saved-access-condition-action"]');
      const banned = /two choices|two options|just two|skip real-time|Set up 1Password saved access|Skip saved access/i.test(document.body?.innerText ?? '');
      return {
        heading,
        modalOpen: Boolean(modal),
        readinessState: readiness?.getAttribute('data-state') ?? null,
        readinessLabel: document.querySelector('[data-testid="saved-access-readiness-label"]')?.textContent ?? null,
        conditionAction: conditionAction?.textContent?.trim() ?? null,
        savedAccessButtons: Array.from(document.querySelectorAll('[data-testid^="saved-access-"]')).map((el) => ({
          testId: el.getAttribute('data-testid'),
          title: el.getAttribute('title'),
          label: el.getAttribute('aria-label'),
          text: el.textContent?.trim(),
        })),
        bannedCopyVisible: banned,
      };
    })()`,
  });
  output = result.result ?? result.content;
} finally {
  socketClient.client?.destroy?.();
  socketClient.client?.end?.();
}
console.log(JSON.stringify(output, null, 2));
process.exit(0);
