# Source provider licensing / branding research

Date: 2026-05-02
Scope: CTO Desktop Morgan Source setup options for hosted GitHub/GitLab app install and CTO-managed self-hosted source control options.

> Practical OSS/product research only; not legal advice. Counsel review required before public/commercial launch or before using third-party marks in product names, docs, marketing, or UI.

## Executive takeaways

1. **Gitea-backed CTO Hub looks plausible at the code-license level.** Gitea's repository license is MIT-style and grants broad rights to use, copy, modify, merge, publish, distribute, sublicense, and sell copies, provided copyright/license notices remain included in copies/substantial portions.
2. **Gitea trademarks/branding are separate from the MIT code license.** Rebranding the product as **CTO Hub** is safer than presenting it as an official Gitea product. If we mention Gitea, use accurate attribution such as `CTO Hub (powered by Gitea)` or `CTO Hub includes/forks Gitea`, subject to trademark review.
3. **GitLab is more constrained.** GitLab CE/FOSS code is MIT for CE portions, but GitLab Enterprise Edition has a restrictive source-available/subscription license. GitLab's trademark guidelines explicitly say the CE MIT license does not cover GitLab trademarks.
4. **Do not rebrand GitLab as a CTO-owned product.** If installing unmodified self-managed GitLab CE, describe it as `self-managed GitLab CE` or `GitLab CE, deployed by CTO`. If CTO modifies or operates it as a managed service, keep CTO branding primary and use GitLab only for truthful compatibility/implementation attribution.
5. **Recommended UI posture:** Use a CTO-branded lane and hide third-party implementation names behind accessible/details/legal copy, not top-level marketing. Example top-level cards: `GitHub`, `GitLab`, `CTO Hub`, `CTO Source`. In details: `CTO Hub is powered by Gitea` and `CTO Source can deploy GitLab CE where permitted`.

## Gitea findings

### Code license

Fetched `https://raw.githubusercontent.com/go-gitea/gitea/main/LICENSE`.

Key text:

- `Copyright (c) 2016 The Gitea Authors`
- `Copyright (c) 2015 The Gogs Authors`
- `Permission is hereby granted, free of charge... to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies...`
- Condition: `The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.`

Practical interpretation:

- Forking, modifying, self-hosting, selling support/services, and distributing a rebranded build are generally permitted by the MIT license.
- We must retain copyright and MIT license notices in shipped artifacts and legal/about notices.
- We should maintain third-party notices for Gitea and Gogs lineage.

### Branding/customization

Gitea docs expose normal customization hooks:

- Config cheat sheet includes `APP_NAME : Gitea: Git with a cup of tea : Application name, used in the page title.`
- Docs include `Customizing Gitea`; customization is typically done through `CustomPath`.
- Public assets/custom assets are supported.

Practical interpretation:

- Custom app name, logo, and assets are technically supported.
- Technical customizability does not equal trademark permission; avoid implying Gitea endorsement.

### Safer Gitea/CTO Hub wording

Preferred:

- Top-level product: `CTO Hub`
- Legal/About: `CTO Hub is powered by Gitea, Copyright (c) The Gitea Authors and The Gogs Authors, licensed under MIT.`
- UI detail: `CTO-managed Git service powered by Gitea`.

Avoid:

- `Official Gitea by CTO`
- Using Gitea logo as CTO Hub logo without permission/trademark review
- Suggesting endorsement/certification/partnership unless actually granted

## GitLab findings

### GitLab CE/FOSS license

Fetched GitLab repository `LICENSE` from GitLab/GitHub mirrors.

Key structure:

- `Copyright (c) 2011-present GitLab Inc.`
- `doc/` is CC BY-SA 4.0.
- `ee/`, if present, uses `ee/LICENSE`.
- `jh/`, if present, uses `jh/LICENSE`.
- Client-side JavaScript is MIT Expat.
- Third-party components retain their original licenses.
- Content outside the special directories is MIT Expat.

GitLab docs state:

- `GitLab Community Edition (CE) is licensed under the terms of the MIT License.`
- `GitLab Enterprise Edition (EE) is licensed under “The GitLab Enterprise Edition (EE) license” wherein there are more restrictions.`

Practical interpretation:

- GitLab CE code has broad MIT permissions with required notices, similar to Gitea at code-license level.
- But the repository can contain mixed-license areas; packaging/distribution must avoid accidentally including EE/JH restricted code unless separately licensed.

### GitLab EE license

Fetched `https://gitlab.com/gitlab-org/gitlab/-/raw/master/ee/LICENSE`.

Key text:

- Production use requires agreement/compliance with GitLab Subscription Terms or another governing agreement and a valid GitLab Enterprise Edition subscription for the correct number of seats.
- Development/testing modification is allowed without subscription.
- Subject to the license, `it is forbidden to copy, merge, publish, distribute, sublicense, and/or sell the Software` beyond expressly stated rights.

Practical interpretation:

- Do **not** fork/rebrand/resell GitLab EE as CTO software.
- If customers want EE/Premium/Ultimate features, they need a valid GitLab subscription and CTO should act as installer/integrator/admin automation, not owner/rebrander.

### GitLab trademark guidelines

Fetched GitLab trademark guidelines page and extracted relevant text.

Important points:

- GitLab CE is MIT, but GitLab explicitly says: `This license does not cover use of the Trademarks.`
- GitLab says modified CE or unmodified CE offered as part of a managed service may confuse users if they do not receive the same features/service as GitLab or trusted partners.
- For unmodified CE distribution, GitLab says you may retain included Trademarks/logos subject to prohibitions.
- For modified CE distribution or managed service hosting, GitLab allows truthful reference to GitLab and products/services, including compatibility/integration claims such as `[Your brand name] managed service for GitLab`, provided it does not imply endorsement/confusion and complies with restrictions.

Practical interpretation:

- `CTO GitLab` as a product name is risky because it puts the GitLab mark inside our branded product name.
- `GitLab CE deployed by CTO`, `self-managed GitLab CE`, or `CTO-managed service for GitLab CE` is safer than rebranding GitLab itself.
- If we modify GitLab or offer it as a managed service, avoid GitLab logos/marks as top-level product branding unless guidelines/counsel approve.

## Recommended Source setup model

### Hosted lane

Top-level:

- `GitHub`
- `GitLab`

Meaning:

- Existing hosted service.
- User installs/authorizes Morgan/CTO app.
- CTO/Morgan provisions through provider APIs after approval.

### CTO-managed self-hosted lane

Safer top-level options:

1. `CTO Hub`
   - Implementation: Gitea-backed, CTO-branded self-hosted Git service.
   - Attribution: `powered by Gitea` in details/legal/About.
   - Keep MIT/Gitea/Gogs notices.

2. `CTO Source` or `GitLab CE`
   - If exact implementation is GitLab CE, safer visible labels are:
     - `GitLab CE`
     - `GitLab CE by CTO`
     - `Self-managed GitLab CE`
     - `CTO-managed GitLab CE`
   - Avoid: `CTO GitLab` as a product brand unless counsel approves.
   - If CTO wants no third-party names in top-level UI, use `CTO Source` and disclose implementation in details/legal: `Deploys GitLab CE where permitted`.

## Compliance checklist before shipping

- [ ] Counsel review for third-party trademark use in UI labels, docs, marketing, domains, and app names.
- [ ] Preserve MIT copyright/license notices for Gitea, Gogs, and GitLab CE if used.
- [ ] Maintain a third-party notices/about page in CTO Desktop and generated customer repos.
- [ ] Do not ship or rebrand GitLab EE code/features without valid subscription/license path.
- [ ] Avoid third-party logos as CTO product icons unless permitted.
- [ ] Use accurate attribution: `powered by`, `based on`, `compatible with`, `deployed by CTO`.
- [ ] Avoid endorsement language: `official`, `certified`, `partner`, `approved` unless actually true.
- [ ] Separate UI product labels from implementation/legal attribution.

## Product recommendation

Adopt **CTO Hub (powered by Gitea)** for the Gitea-backed option, with attribution in brackets/details/legal notices. For GitLab, do **not** rebrand it as CTO-owned GitLab. Prefer either:

- `GitLab CE` / `self-managed GitLab CE` / `GitLab CE by CTO` if the user must choose that implementation; or
- `CTO Source` as a branded CTO access-control/source package, with GitLab CE named only in details as the implementation where permitted.
