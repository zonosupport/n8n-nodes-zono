# n8n-nodes-zono

The official [n8n](https://n8n.io) nodes for [Zono Support](https://zono.support), the AI helpdesk for software teams.

- **Zono Support Trigger** starts a workflow the moment something happens in Zono: a new ticket, a reply, a satisfaction rating, an SLA breach and more.
- **Zono Support** creates and updates tickets, replies, internal notes and customers from any workflow.

## Requirements

- A Zono workspace on **Premium**. You can start on Zono for free; the API and integrations are part of Premium.
- An n8n instance where you can install community nodes (n8n Cloud, or self-hosted as the instance owner).
- For the trigger: n8n must be reachable from the internet, because Zono sends events to it. Zono does not deliver to private or local addresses.
- For the trigger and for customer operations: a token from a Zono **Owner** or **Admin**.

## Install

1. In n8n, go to **Settings › Community Nodes**.
2. Click **Install**.
3. Enter `n8n-nodes-zono`, confirm the notice and click **Install**.

## Set up the credential

1. In Zono, open the menu under your name, choose **Profile settings**, then go to **API & MCP Tokens**.
2. Under **Create a new token**, give it a name (for example "n8n"), pick the team, and click **Read and write**. Optionally set an expiry and your n8n server's IP under **Allowed IPs**.
3. Click **Generate token** and copy it. It is shown only once.
4. In n8n, add a **Zono Support** or **Zono Support Trigger** node and create a new **Zono Support API** credential. Paste the token you copied as the **API Token**.
5. Save. n8n checks the connection straight away.

## Trigger events

Pick one or more events, or **All Events**, in the **Zono Support Trigger**:

| Area | Events |
| --- | --- |
| Tickets | Ticket Created, Ticket Updated, Ticket Status Changed, Ticket Closed, Ticket Assigned, Ticket Public Reply Added, Ticket Internal Note Added, Ticket Merged, Ticket Split, Ticket Classified by AI, Ticket Sentiment Dropped, Ticket Linked Issue Status Changed |
| Customers and chats | Customer Created, Conversation Promoted to a Ticket |
| Satisfaction and SLAs | Customer Rated Support (CSAT), SLA Due Soon, SLA Breached |

When you activate the workflow, the node subscribes to Zono for you. The subscription shows in Zono under **Settings › Developers › Webhooks** with an **n8n** badge, and it is removed when you deactivate the workflow.

**Verify Signature** is on by default: every delivery is checked against the signing secret Zono gave the node, and anything that does not match is rejected. Keep it on.

## Operations

| Resource | Operations |
| --- | --- |
| Ticket | Create (finds or creates the customer by email), Get, Get Many, Update |
| Reply | Create |
| Note | Create (internal, staff only) |
| Customer | Create, Get, Get Many (find by email, external ID or marketplace username), Update |

Product, department, tag and assignee dropdowns are filled from your workspace.

## Troubleshooting

- **The credential test fails**: check the token is complete, not expired or revoked, and that the workspace is on Premium. If you set **Allowed IPs**, include your n8n server's IP.
- **The trigger will not activate**: it needs a read-write token from an Owner or Admin.
- **The trigger never fires**: make sure n8n is reachable from the internet (on a self-hosted n8n, set `WEBHOOK_URL` to its public address), then check the subscription's delivery log in Zono under **Settings › Developers › Webhooks**.
- **Customer operations fail with a permission error**: they need a token from an Owner or Admin.

## Links

- Setup guide: https://zono.support/help/n8n
- REST API reference: https://zono.support/developers/api
- Zono integrations: https://zono.support/integrations

## Support

Questions, bugs or ideas: email hello@zono.support and tell us what you tried.

## License

MIT
