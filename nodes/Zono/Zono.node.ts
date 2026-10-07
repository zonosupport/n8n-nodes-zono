import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeProperties,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import { compact, loadReferenceOptions, zonoApiRequest, zonoApiRequestAllItems } from './GenericFunctions';

const ticketId: INodeProperties = {
	displayName: 'Ticket Number or ID',
	name: 'ticket',
	type: 'string',
	required: true,
	default: '',
	placeholder: '1042',
	description: 'The ticket number (e.g. 1042) or its ID',
};

const priorityOptions: INodePropertyOptions[] = [
	{ name: 'Low', value: 'low' },
	{ name: 'Normal', value: 'normal' },
	{ name: 'High', value: 'high' },
	{ name: 'Urgent', value: 'urgent' },
];

const statusOptions: INodePropertyOptions[] = [
	{ name: 'Open', value: 'open' },
	{ name: 'Answered', value: 'answered' },
	{ name: 'On Hold', value: 'on-hold' },
	{ name: 'Closed', value: 'closed' },
];

/**
 * Ticket fields shared by create and update ("Additional Fields" / "Update Fields").
 */
const ticketFields: INodeProperties[] = [
	{ displayName: 'Assignee Name or ID', name: 'assignee_id', type: 'options', typeOptions: { loadOptionsMethod: 'getUsers' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
	{ displayName: 'Custom Fields (JSON)', name: 'custom_fields', type: 'json', default: '{}', description: 'Values keyed by the custom field key' },
	{ displayName: 'Department Name or ID', name: 'department_id', type: 'options', typeOptions: { loadOptionsMethod: 'getDepartments' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
	{ displayName: 'Priority', name: 'priority', type: 'options', options: priorityOptions, default: 'normal' },
	{ displayName: 'Tag Names or IDs', name: 'tag_ids', type: 'multiOptions', typeOptions: { loadOptionsMethod: 'getTags' }, default: [], description: 'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
];

export class Zono implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zono Support',
		name: 'zono',
		icon: { light: 'file:zono.svg', dark: 'file:zono.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create and update Zono Support tickets, replies, notes and customers',
		defaults: { name: 'Zono Support' },
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [{ name: 'zonoApi', required: true }],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Customer', value: 'customer' },
					{ name: 'Note', value: 'note' },
					{ name: 'Reply', value: 'reply' },
					{ name: 'Ticket', value: 'ticket' },
				],
				default: 'ticket',
			},

			// Ticket
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['ticket'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a ticket' },
					{ name: 'Get', value: 'get', action: 'Get a ticket' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many tickets' },
					{ name: 'Update', value: 'update', action: 'Update a ticket' },
				],
				default: 'create',
			},
			{ displayName: 'Subject', name: 'subject', type: 'string', required: true, default: '', displayOptions: { show: { resource: ['ticket'], operation: ['create'] } } },
			{ displayName: 'Description', name: 'description', type: 'string', typeOptions: { rows: 4 }, required: true, default: '', description: 'The first message; HTML is kept', displayOptions: { show: { resource: ['ticket'], operation: ['create'] } } },
			{ displayName: 'Product Name or ID', name: 'product_id', type: 'options', typeOptions: { loadOptionsMethod: 'getProducts' }, required: true, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>', displayOptions: { show: { resource: ['ticket'], operation: ['create'] } } },
			{ displayName: 'Customer Email', name: 'customerEmail', type: 'string', placeholder: 'name@example.com', default: '', description: 'Finds the customer by email or creates them (owner or admin token). Leave empty to use Customer ID.', displayOptions: { show: { resource: ['ticket'], operation: ['create'] } } },
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['ticket'], operation: ['create'] } },
				options: [
					{ displayName: 'Customer ID', name: 'customer_id', type: 'string', default: '' },
					{ displayName: 'Customer Name', name: 'customer_name', type: 'string', default: '' },
					...ticketFields,
				],
			},
			{ ...ticketId, displayOptions: { show: { resource: ['ticket'], operation: ['get', 'update'] } } },
			{
				displayName: 'Update Fields',
				name: 'updateFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['ticket'], operation: ['update'] } },
				options: [
					...ticketFields,
					{ displayName: 'Product Name or ID', name: 'product_id', type: 'options', typeOptions: { loadOptionsMethod: 'getProducts' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
					{ displayName: 'Status', name: 'status', type: 'options', options: statusOptions, default: 'open' },
					{ displayName: 'Subject', name: 'subject', type: 'string', default: '' },
				],
			},
			{ displayName: 'Return All', name: 'returnAll', type: 'boolean', default: false, description: 'Whether to return all results or only up to a given limit', displayOptions: { show: { resource: ['ticket', 'customer'], operation: ['getAll'] } } },
			{ displayName: 'Limit', name: 'limit', type: 'number', typeOptions: { minValue: 1 }, default: 50, description: 'Max number of results to return', displayOptions: { show: { resource: ['ticket', 'customer'], operation: ['getAll'], returnAll: [false] } } },
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['ticket'], operation: ['getAll'] } },
				options: [
					{ displayName: 'Assignee', name: 'assignee_id', type: 'string', default: '', description: 'A user ID, "me" or "unassigned"' },
					{ displayName: 'Customer Email', name: 'customer_email', type: 'string', placeholder: 'name@example.com', default: '', description: 'The customer\'s exact email (case-insensitive)' },
					{ displayName: 'Customer ID', name: 'customer_id', type: 'string', default: '' },
					{ displayName: 'Priority', name: 'priority', type: 'string', default: '', description: 'Low, normal, high, urgent or none; comma-separate several' },
					{ displayName: 'Search', name: 'search', type: 'string', default: '', description: 'Matches the subject; a ticket number (1042 or #1042) also matches that ticket' },
					{ displayName: 'Status', name: 'status', type: 'string', default: '', description: 'Open, answered, on-hold or closed; comma-separate several' },
					{ displayName: 'Updated After', name: 'updated_after', type: 'dateTime', default: '' },
				],
			},

			// Reply
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['reply'] } },
				options: [{ name: 'Create', value: 'create', action: 'Reply to a ticket' }],
				default: 'create',
			},
			{ ...ticketId, displayOptions: { show: { resource: ['reply', 'note'] } } },
			{ displayName: 'Message', name: 'body', type: 'string', typeOptions: { rows: 4 }, required: true, default: '', displayOptions: { show: { resource: ['reply', 'note'] } } },
			{
				displayName: 'Options',
				name: 'replyOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['reply'] } },
				options: [
					{ displayName: 'Close Ticket', name: 'close_ticket', type: 'boolean', default: false, description: 'Whether to close the ticket with this reply' },
					{ displayName: 'Internal', name: 'is_internal', type: 'boolean', default: false, description: 'Whether the reply is staff-only' },
				],
			},

			// Note
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['note'] } },
				options: [{ name: 'Create', value: 'create', action: 'Add an internal note' }],
				default: 'create',
			},

			// Customer
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['customer'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a customer' },
					{ name: 'Get', value: 'get', action: 'Get a customer' },
					{ name: 'Get Many', value: 'getAll', action: 'Find customers' },
					{ name: 'Update', value: 'update', action: 'Update a customer' },
				],
				default: 'create',
			},
			{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@example.com', required: true, default: '', displayOptions: { show: { resource: ['customer'], operation: ['create'] } } },
			{ displayName: 'Customer ID', name: 'customerId', type: 'string', required: true, default: '', displayOptions: { show: { resource: ['customer'], operation: ['get', 'update'] } } },
			{
				displayName: 'Fields',
				name: 'customerFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['customer'], operation: ['create', 'update'] } },
				options: [
					{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@example.com', default: '', description: 'New email (update only)' },
					{ displayName: 'External ID', name: 'external_id', type: 'string', default: '', description: 'Your own ID for the customer; unique in the team' },
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
				],
			},
			{
				displayName: 'Filters',
				name: 'customerFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['customer'], operation: ['getAll'] } },
				options: [
					{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@example.com', default: '', description: 'Exact email (case-insensitive)' },
					{ displayName: 'External ID', name: 'external_id', type: 'string', default: '' },
					{ displayName: 'Marketplace Username', name: 'marketplace_username', type: 'string', default: '', description: 'The customer\'s username on a connected marketplace, e.g. their Envato buyer username (case-insensitive)' },
					{ displayName: 'Search', name: 'search', type: 'string', default: '', description: 'Matches name or email' },
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getProducts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return loadReferenceOptions.call(this, '/products');
			},
			async getDepartments(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return loadReferenceOptions.call(this, '/departments');
			},
			async getTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return loadReferenceOptions.call(this, '/tags');
			},
			async getUsers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return loadReferenceOptions.call(this, '/users');
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const results: INodeExecutionData[] = [];

		for (let index = 0; index < items.length; index++) {
			try {
				const resource = this.getNodeParameter('resource', index) as string;
				const operation = this.getNodeParameter('operation', index) as string;
				const output = await runOperation.call(this, resource, operation, index);

				for (const json of Array.isArray(output) ? output : [output]) {
					results.push({ json, pairedItem: { item: index } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					results.push({ json: { error: (error as Error).message }, pairedItem: { item: index } });
					continue;
				}

				// Keeps the API error's message and details (NodeApiError) and adds the item index.
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: index,
					description: error instanceof NodeApiError ? (error.description ?? undefined) : undefined,
				});
			}
		}

		return [results];
	}
}

function ticketPath(this: IExecuteFunctions, index: number): string {
	const ticket = String(this.getNodeParameter('ticket', index)).replace(/^#/, '').trim();

	return `/tickets/${encodeURIComponent(ticket)}`;
}

function parseCustomFields(this: IExecuteFunctions, fields: IDataObject, index: number): IDataObject {
	if (fields.custom_fields === undefined || fields.custom_fields === '') {
		return fields;
	}

	const raw = fields.custom_fields;
	let parsed: unknown = raw;

	if (typeof raw === 'string') {
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new NodeOperationError(this.getNode(), 'Custom Fields must be a JSON object.', { itemIndex: index });
		}
	}

	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
		const rest = { ...fields };
		delete rest.custom_fields;

		return rest;
	}

	return { ...fields, custom_fields: parsed as IDataObject };
}

async function runOperation(this: IExecuteFunctions, resource: string, operation: string, index: number): Promise<IDataObject | IDataObject[]> {
	if (resource === 'ticket') {
		if (operation === 'create') {
			const additional = parseCustomFields.call(this, this.getNodeParameter('additionalFields', index, {}) as IDataObject, index);
			const email = this.getNodeParameter('customerEmail', index, '') as string;
			const { customer_name: customerName, ...fields } = additional;

			if (!email && !fields.customer_id) {
				throw new NodeOperationError(this.getNode(), 'Set Customer Email, or Customer ID under Additional Fields.', { itemIndex: index });
			}

			return zonoApiRequest.call(this, 'POST', '/tickets', compact({
				subject: this.getNodeParameter('subject', index) as string,
				description: this.getNodeParameter('description', index) as string,
				product_id: this.getNodeParameter('product_id', index) as number,
				...fields,
				customer_id: email ? undefined : fields.customer_id,
				customer: email ? compact({ email, name: customerName }) : undefined,
			}));
		}

		if (operation === 'get') {
			return zonoApiRequest.call(this, 'GET', ticketPath.call(this, index));
		}

		if (operation === 'update') {
			const fields = parseCustomFields.call(this, this.getNodeParameter('updateFields', index, {}) as IDataObject, index);

			return zonoApiRequest.call(this, 'PATCH', ticketPath.call(this, index), compact(fields));
		}

		if (operation === 'getAll') {
			return getMany.call(this, '/tickets', compact(this.getNodeParameter('filters', index, {}) as IDataObject), index);
		}
	}

	if (resource === 'reply') {
		const options = this.getNodeParameter('replyOptions', index, {}) as IDataObject;

		return zonoApiRequest.call(this, 'POST', `${ticketPath.call(this, index)}/replies`, {
			body: this.getNodeParameter('body', index) as string,
			is_internal: Boolean(options.is_internal),
			close_ticket: Boolean(options.close_ticket),
		});
	}

	if (resource === 'note') {
		return zonoApiRequest.call(this, 'POST', `${ticketPath.call(this, index)}/notes`, { body: this.getNodeParameter('body', index) as string });
	}

	if (resource === 'customer') {
		const customerPath = () => `/customers/${encodeURIComponent(this.getNodeParameter('customerId', index) as string)}`;

		if (operation === 'create') {
			const fields = this.getNodeParameter('customerFields', index, {}) as IDataObject;

			return zonoApiRequest.call(this, 'POST', '/customers', compact({ ...fields, email: this.getNodeParameter('email', index) as string }));
		}

		if (operation === 'get') {
			return zonoApiRequest.call(this, 'GET', customerPath());
		}

		if (operation === 'update') {
			return zonoApiRequest.call(this, 'PATCH', customerPath(), compact(this.getNodeParameter('customerFields', index, {}) as IDataObject));
		}

		if (operation === 'getAll') {
			return getMany.call(this, '/customers', compact(this.getNodeParameter('customerFilters', index, {}) as IDataObject), index);
		}
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}" for "${resource}".`, { itemIndex: index });
}

async function getMany(this: IExecuteFunctions, endpoint: string, qs: IDataObject, index: number): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? undefined : (this.getNodeParameter('limit', index, 50) as number);

	return zonoApiRequestAllItems.call(this, endpoint, qs, limit);
}
