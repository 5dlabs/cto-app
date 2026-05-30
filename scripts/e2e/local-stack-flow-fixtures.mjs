export function createSetupFlowDocument({ token = "", owner = "5DLabsInc" } = {}) {
  const tokenPanel = token
    ? `<div class="local-bootstrap__hint-row">GitHub credentials are already configured. CTO will use that token during install.</div>`
    : `<button class="primary-btn" type="button" data-testid="source-authorize-github" title="Authorize with GitHub">Authorize with GitHub</button>`;
  const sourceDisabled = token ? "" : "disabled";

  return `
    <main>
      <h1>Source</h1>
      <section class="local-bootstrap__panel" title="Repository authorization">
        <input placeholder="5DLabsInc" value="${owner}" />
        <button type="button" data-testid="source-auth-oauth"><strong>GitHub OAuth</strong></button>
        <button type="button" data-testid="source-auth-pat"><strong>Personal access token</strong></button>
        <input placeholder="github_pat_..." type="password" value="${token}" />
        ${tokenPanel}
        <button class="primary-btn" type="button" title="Continue to harness selection" ${sourceDisabled}>Continue</button>
      </section>
    </main>
  `;
}

export function createAuthMatrixSourceDocument() {
  return `
    <main>
      <h1>Source</h1>
      <section class="local-bootstrap__panel" title="Repository authorization">
        <p>Where is your code? Choose GitHub or GitLab first; Morgan defaults to the hosted service and reveals enterprise/self-managed only after that choice.</p>
        <label>Owner, org, group, or namespace <input name="owner" value="5DLabsInc" /></label>
        <button data-testid="source-provider-github"><strong>GitHub</strong></button>
        <button data-testid="source-provider-gitlab"><strong>GitLab</strong></button>
        <button data-testid="source-github-enterprise"><strong>Using GitHub Enterprise?</strong></button>
        <button data-testid="source-auth-github-pat"><strong>Use a personal access token instead</strong></button>
        <button data-testid="source-gitlab-self-managed"><strong>Using self-managed GitLab?</strong></button>
        <button data-testid="source-gitlab-token"><strong>Use a manual token instead</strong></button>
        <input name="baseUrl" placeholder="https://github.example.com or https://gitlab.example.com" value="" />
        <input name="token" placeholder="token" type="password" value="" />
        <button title="Continue to harness selection" disabled>Continue</button>
      </section>
    </main>
  `;
}

export function createGitHubPatSourceDocument({ token = "github_pat_secret_value" } = {}) {
  return `
    <main>
      <h1>Source</h1>
      <section title="Repository authorization">
        <p>GitHub.com source with personal access token fallback.</p>
        <input name="owner" value="5DLabsInc" />
        <button><strong>GitHub</strong></button>
        <button><strong>Use a personal access token instead</strong></button>
        <input name="baseUrl" value="https://github.com" />
        <input name="token" type="password" value="${token}" />
        <button title="Continue to harness selection">Continue</button>
      </section>
    </main>
  `;
}

export function createGitLabDotComSourceDocument() {
  return `
    <main>
      <h1>Source</h1>
      <section title="Repository authorization">
        <p>GitLab.com source installs Morgan on the selected GitLab account, then detects groups and projects. Manual token is a review-details fallback.</p>
        <input name="owner" value="platform-group" />
        <button><strong>GitLab</strong></button>
        <button><strong>Install Morgan on GitLab</strong></button>
        <button><strong>Use a manual token instead</strong></button>
        <input name="baseUrl" value="https://gitlab.com" />
        <input name="token" type="password" value="glpat_secret_value" />
        <button title="Continue to harness selection">Continue</button>
      </section>
    </main>
  `;
}

export function createSelfHostedGitLabSourceDocument() {
  return `
    <main>
      <h1>Source</h1>
      <section title="Repository authorization">
        <p>GitLab self-hosted source uses an instance OAuth application and admin applications endpoint.</p>
        <input name="owner" value="platform" />
        <button><strong>GitLab</strong></button>
        <button><strong>Using self-managed GitLab?</strong></button>
        <input name="baseUrl" value="https://gitlab.example.test" />
        <p>OAuth application callback will be created for https://gitlab.example.test.</p>
        <button title="Continue to harness selection">Continue</button>
      </section>
    </main>
  `;
}

export function snapshotFromDocument(html) {
  const redacted = html
    .replace(/github_pat_[^"<\s]+/g, "[REDACTED]")
    .replace(/glpat_[^"<\s]+/g, "[REDACTED]");
  const text = redacted
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const heading = matchFirst(redacted, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const buttons = Array.from(redacted.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)).map(
    ([, attrs, body]) => ({
      text: stripTags(body),
      title: attr(attrs, "title"),
      aria: attr(attrs, "aria-label"),
      testId: attr(attrs, "data-testid"),
      disabled: /\bdisabled\b/i.test(attrs),
      ariaDisabled: attr(attrs, "aria-disabled") === "true",
    }),
  );
  const inputs = Array.from(redacted.matchAll(/<input\b([^>]*)>/gi)).map(([, attrs]) => ({
    name: attr(attrs, "name"),
    placeholder: attr(attrs, "placeholder"),
    type: attr(attrs, "type") || "text",
    value: attr(attrs, "value"),
  }));
  return { heading, text, buttons, inputs, controls: buttons, selected: [] };
}

function matchFirst(value, regex) {
  const match = value.match(regex);
  return match ? stripTags(match[1]) : "";
}

function attr(attrs, name) {
  const match = attrs.match(new RegExp(`${name}=["']([^"']*)["']`, "i"));
  return match ? match[1] : "";
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function createFullSetupFlowDocument() {
  return `
    <main>
      <h1>CTO</h1>
      <section title="Client Cluster baseline">
        <button data-testid="prepare-cluster-dependencies" title="Prepare Client Cluster baseline">Prepare</button>
        <button title="Continue to saved access">Continue</button>
      </section>
      <h1>Secrets</h1>
      <section title="Secrets">
        <button data-testid="saved-access-onepassword" title="Use 1Password for secrets"><strong>1Password</strong></button>
        <button data-testid="saved-access-bitwarden" title="Use Bitwarden for secrets"><strong>Bitwarden</strong></button>
        <button data-testid="saved-access-skip" title="Continue without a secret manager"><strong>Continue</strong></button>
      </section>
      <h1>Cloudflare</h1>
      <section title="Morgan public endpoint">
        <button data-testid="cloudflare-endpoint-oauth" title="Sign in with Cloudflare"><strong>Cloudflare</strong></button>
        <button data-testid="cloudflare-endpoint-saved-access" title="Find Cloudflare access in 1Password"><strong>1Password</strong></button>
        <button data-testid="cloudflare-endpoint-quick-tunnel" title="Use a temporary Cloudflare tunnel"><strong>Quick tunnel</strong></button>
        <button data-testid="cloudflare-endpoint-local" title="Continue without public webhooks">Local only</button>
        <button title="Continue to Source">Continue</button>
      </section>
      <h1>Source</h1>
      <section title="Repository authorization">
        <button data-testid="source-auth-oauth"><strong>GitHub OAuth</strong></button>
        <button type="button">Review details</button>
        <button data-testid="source-auth-github-pat"><strong>Use a personal access token instead</strong></button>
        <button data-testid="source-authorize-github" title="Authorize with GitHub">Authorize with GitHub</button>
        <button title="Continue to harness selection">Continue</button>
      </section>
      <section title="Harnesses">
        <button title="Hermes harness"><strong>Hermes</strong></button>
        <button title="Continue to dynamic workflows">Continue</button>
      </section>
      <section title="Dynamic workflows">
        <button title="Copilot agent surface"><strong>Copilot</strong></button>
        <button title="Continue to providers">Continue</button>
      </section>
      <section title="Providers">
        <button title="GitHub Copilot provider"><strong>GitHub Copilot</strong></button>
        <button title="Configure provider authentication">Continue</button>
      </section>
      <section title="Selected provider models">
        <button title="GitHub Copilot gpt-5.1-codex-max">gpt-5.1-codex-max</button>
        <button title="Choose harness routing">Continue</button>
      </section>
      <section title="ACP harness model routing">
        <label><input type="radio" name="harness-primary-model" checked />Primary</label>
        <button title="Configure provider authentication">Continue</button>
      </section>
      <section title="Selected provider authentication">
        <button title="Configure tool API keys">Continue</button>
      </section>
      <section title="Common MCP tool API keys">
        <button title="Configure agent Discord tokens">Continue</button>
      </section>
      <section title="Agent Discord bots">
        <button title="Start local stack">Start</button>
      </section>
    </main>
  `;
}
