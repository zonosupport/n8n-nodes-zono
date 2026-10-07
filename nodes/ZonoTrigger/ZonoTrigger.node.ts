import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

import { verifyZonoSignature, ZONO_EVENTS, zonoApiRequest } from '../Zono/GenericFunctions';

/**
 * Starts a workflow on Zono webhook events. Activating the workflow
 * subscribes this node's webhook URL through POST /api/v1/hooks (a REST Hook
 * tied to the credential's token); deactivating it unsubscribes. The signing
 * secret Zono returns on subscribe is kept in the node's static data and used
 * to verify every delivery's Zono-Signature header.
 */
export class ZonoTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zono Support Trigger',
		name: 'zonoTrigger',
		icon: 'file:zono.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when Zono Support sends a webhook event',
		defaults: { name: 'Zono Support Trigger' },
		inputs: [],
		outputs: [NodeConnectionType.Main],
		credentials: [{ name: 'zonoApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: ZONO_EVENTS,
				required: true,
				default: ['ticket.created'],
				description: 'The events to listen to. Needs an owner or admin token.',
			},
			{
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: true,
				description: 'Whether to reject requests whose Zono-Signature does not match the subscription secret',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');

				if (!staticData.webhookId) {
					return false;
				}

				try {
					const subscription = await zonoApiRequest.call(this, 'GET', `/hooks/${encodeURIComponent(String(staticData.webhookId))}`);
					const events = subscribedEvents(this.getNodeParameter('events') as string[]);
					const sameEvents = [...(subscription.events as string[])].sort().join(',') === [...events].sort().join(',');

					if (subscription.target_url === this.getNodeWebhookUrl('default') && sameEvents && staticData.secret) {
						return true;
					}
				} catch (error) {
					// Gone (404) or not readable: create a new subscription.
				}

				delete staticData.webhookId;
				delete staticData.secret;

				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const events = this.getNodeParameter('events') as string[];
				const subscription = await zonoApiRequest.call(this, 'POST', '/hooks', {
					target_url: this.getNodeWebhookUrl('default') as string,
					events: events.includes('*') ? ['*'] : events,
					integration: 'n8n',
					description: `n8n: ${this.getWorkflow().name ?? 'workflow'}`.slice(0, 255),
				});

				const staticData = this.getWorkflowStaticData('node');
				staticData.webhookId = subscription.id as string;
				staticData.secret = subscription.secret as string;

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');

				if (staticData.webhookId) {
					try {
						await zonoApiRequest.call(this, 'DELETE', `/hooks/${encodeURIComponent(String(staticData.webhookId))}`);
					} catch (error) {
						// Already gone (token revoked, or removed in Settings > Webhooks).
					}
				}

				delete staticData.webhookId;
				delete staticData.secret;

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;
		const request = this.getRequestObject() as unknown as { rawBody?: Buffer };
		const staticData = this.getWorkflowStaticData('node');

		if (this.getNodeParameter('verifySignature', true) as boolean) {
			const header = String(this.getHeaderData()['zono-signature'] ?? '');
			const rawBody = request.rawBody ? request.rawBody.toString('utf8') : JSON.stringify(body);
			const secret = String(staticData.secret ?? '');

			if (!secret || !verifyZonoSignature(rawBody, header, secret)) {
				const response = this.getResponseObject();
				response.status(401).send('Invalid Zono-Signature').end();

				return { noWebhookResponse: true };
			}
		}

		// "Send test event" from Settings > Webhooks: acknowledge without running the workflow.
		if (body.type === 'ping') {
			return { webhookResponse: 'ok' };
		}

		return { workflowData: [this.helpers.returnJsonArray(body)] };
	}
}

/**
 * The events a subscription made with this selection covers.
 */
function subscribedEvents(selected: string[]): string[] {
	return selected.includes('*')
		? ZONO_EVENTS.map((option) => String(option.value)).filter((value) => value !== '*')
		: selected;
}
