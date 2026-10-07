# Contributing to n8n-nodes-zono

Developer notes for the n8n community node package. The user-facing docs are in [README.md](README.md), which is what npmjs.com shows.

## How it works

- **Zono Support Trigger** (`zonoTrigger`): when the workflow is activated, the node subscribes its webhook URL through `POST /api/v1/hooks`, and it unsubscribes (`DELETE /api/v1/hooks/{id}`) when the workflow is deactivated. The signing secret Zono returns is stored in the node's static data, and the node uses it to check each delivery's `Zono-Signature`.
- **Zono Support** (`zono`):

| Resource | Operation | Zono API |
| --- | --- | --- |
| Ticket | Create | `POST /tickets` (customer found or created by email) |
| Ticket | Get | `GET /tickets/{ticket}` |
| Ticket | Get Many | `GET /tickets` (cursor pagination) |
| Ticket | Update | `PATCH /tickets/{ticket}` |
| Reply | Create | `POST /tickets/{ticket}/replies` |
| Note | Create | `POST /tickets/{ticket}/notes` |
| Customer | Create | `POST /customers` |
| Customer | Get | `GET /customers/{customer}` |
| Customer | Get Many / find | `GET /customers?email=&external_id=&marketplace_username=&search=` |
| Customer | Update | `PATCH /customers/{customer}` |

The product, department, tag and assignee dropdowns are filled from `GET /products`, `/departments`, `/tags` and `/users`.

The **Zono Support API** credential takes a team API token. Requests always go to `https://zono.support/api/v1`: the API host is fixed. It is tested against `GET /me`. The trigger needs a read-write token from an owner or admin account.

The n8n node uses an API key, while Zapier and Make use OAuth 2.0. OAuth needs a client registered on Zono with a fixed redirect URL, but every self-hosted n8n instance has its own callback URL (`https://<your-n8n>/rest/oauth2-credential/callback`). An API key works with any n8n instance and with self-hosted Zono installs.

## Build

```bash
git clone https://github.com/zonosupport/n8n-nodes-zono.git
cd n8n-nodes-zono
npm install
npm run build   # tsc, then copies the icons to dist/
```

## Test locally

1. Build the package, then link it into your local n8n:

   ```bash
   npm link
   cd ~/.n8n/custom   # create it if missing, then run `npm init -y` once
   npm link n8n-nodes-zono
   n8n start
   ```

2. Add a **Zono Support API** credential with an owner token from a Premium team.
3. Add a **Zono Support Trigger**. Pick events and activate the workflow. A "n8n" badged subscription appears in Zono under Settings > Developers > Webhooks.
4. Trigger an event in Zono, such as creating a ticket, and check the execution. If you deactivate the workflow, the subscription disappears.

n8n must be reachable from the internet for Zono to deliver. For local testing, use `n8n start --tunnel` or set `WEBHOOK_URL` to a public tunnel. Zono refuses private and loopback addresses.

## Publish

`.github/workflows/publish.yml` publishes to npm with provenance automatically when a change lands on `main` and `package.json` carries a version that is not on npm yet, then tags the release `v<version>`. **Bump `version` in `package.json` (and `package-lock.json`) for every change you want on npm, including README-only changes:** npmjs.com shows the README of the latest published version.

To publish by hand instead:

1. Check the package against the [community node guidelines](https://docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines/): the package name starts with `n8n-nodes-`, it has the `n8n-community-node-package` keyword, and it has no runtime dependencies.
2. Run `npm login` with the Zono npm account, then `npm publish --access public`. `prepublishOnly` builds it first.
3. Users install it from Settings > Community Nodes > Install, using `n8n-nodes-zono`.
4. **Verified node (optional):** submit the package through the [n8n Creator Portal](https://creators.n8n.io). n8n reviews the code, the UX and the docs; verified nodes also show up on n8n Cloud. Run the `@n8n/scan-community-package` linter first: `npx @n8n/scan-community-package n8n-nodes-zono`.

