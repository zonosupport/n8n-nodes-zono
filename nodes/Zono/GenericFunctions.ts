import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/** Zono's REST API v1. Zono is only hosted at zono.support. */
export const ZONO_API_URL = 'https://zono.support/api/v1';

type ZonoContext = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions;

/**
 * Calls Zono REST API v1 with the zonoApi credential.
 */
export async function zonoApiRequest(
	this: ZonoContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
	options: Partial<IHttpRequestOptions> = {},
): Promise<any> {
	const request: IHttpRequestOptions = {
		method,
		url: `${ZONO_API_URL}${endpoint}`,
		qs,
		json: true,
		...options,
	};

	if (Object.keys(body).length > 0) {
		request.body = body;
	}

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'zonoApi', request);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/**
 * Follows cursor pagination (meta.next_cursor) until the end or the limit.
 */
export async function zonoApiRequestAllItems(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	endpoint: string,
	qs: IDataObject = {},
	limit?: number,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let cursor: string | undefined;

	do {
		const response = await zonoApiRequest.call(this, 'GET', endpoint, {}, { ...qs, per_page: 100, ...(cursor ? { cursor } : {}) });
		items.push(...((response.data as IDataObject[]) ?? []));
		cursor = response.meta?.next_cursor ?? undefined;

		if (limit !== undefined && items.length >= limit) {
			return items.slice(0, limit);
		}
	} while (cursor);

	return items;
}

/**
 * Dropdown options from a reference list (products, departments, tags, users).
 */
export async function loadReferenceOptions(this: ILoadOptionsFunctions, endpoint: string): Promise<INodePropertyOptions[]> {
	const items = await zonoApiRequestAllItems.call(this, endpoint);

	return items
		.map((item) => ({ name: String(item.name ?? item.id), value: item.id as string | number }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Removes empty optional values so they are not sent.
 */
export function compact(values: IDataObject): IDataObject {
	return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

/**
 * Checks a Zono-Signature header ("t=<unix>,v1=<hex>[,v1=<hex>]"): HMAC-SHA256
 * of "<t>.<raw body>" with the subscription secret, within the tolerance.
 */
export function verifyZonoSignature(rawBody: string, header: string, secret: string, toleranceSeconds = 300): boolean {
	const parts = header.split(',').map((part) => part.trim().split('='));
	const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
	const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');

	if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) {
		return false;
	}

	const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

	return signatures.some(
		(signature) => signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)),
	);
}

/**
 * The events a Zono webhook subscription can carry.
 */
export const ZONO_EVENTS: INodePropertyOptions[] = [
	{ name: 'All Events', value: '*' },
	{ name: 'Conversation Promoted to a Ticket', value: 'conversation.promoted' },
	{ name: 'Customer Created', value: 'customer.created' },
	{ name: 'Customer Rated Support (CSAT)', value: 'csat.rated' },
	{ name: 'SLA Breached', value: 'sla.breached' },
	{ name: 'SLA Due Soon', value: 'sla.warning' },
	{ name: 'Ticket Assigned', value: 'ticket.assigned' },
	{ name: 'Ticket Classified by AI', value: 'ticket.classified' },
	{ name: 'Ticket Closed', value: 'ticket.closed' },
	{ name: 'Ticket Created', value: 'ticket.created' },
	{ name: 'Ticket Internal Note Added', value: 'ticket.note_added' },
	{ name: 'Ticket Linked Issue Status Changed', value: 'ticket.linked_issue_status_changed' },
	{ name: 'Ticket Merged', value: 'ticket.merged' },
	{ name: 'Ticket Public Reply Added', value: 'ticket.replied' },
	{ name: 'Ticket Sentiment Dropped', value: 'ticket.sentiment_dropped' },
	{ name: 'Ticket Split', value: 'ticket.split' },
	{ name: 'Ticket Status Changed', value: 'ticket.status_changed' },
	{ name: 'Ticket Updated', value: 'ticket.updated' },
];
