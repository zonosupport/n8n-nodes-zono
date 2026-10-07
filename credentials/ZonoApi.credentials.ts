import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

/**
 * A Zono team API token (Profile > API & MCP tokens, Premium plan). The
 * trigger subscribes webhooks, which needs an owner or admin token with
 * read-write access.
 */
export class ZonoApi implements ICredentialType {
	name = 'zonoApi';

	displayName = 'Zono Support API';

	icon: Icon = { light: 'file:../nodes/Zono/zono.svg', dark: 'file:../nodes/Zono/zono.dark.svg' };

	documentationUrl = 'https://zono.support/developers/api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A read-write token from Profile > API & MCP tokens in Zono. Use an owner or admin account for the Zono Trigger node.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
				Accept: 'application/json',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://zono.support/api/v1',
			url: '/me',
		},
	};
}
