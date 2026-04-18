import { STATUS_CODES } from 'http';
import { handlePollRequest } from './poll/poll-manager';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/poll')) {
			return await handlePollRequest(request, env);
		}

		if (url.pathname === '/fsysutils' || url.pathname === '/fsysutils/') {
			return new Response('#!/usr/bin/env fish\n\nset repoPath $HOME/falcon-system-utils\n\nrm -rf $repoPath\ngit clone https://github.com/HanSolo1000Falcon/falcon-system-utils.git $repoPath\nor exit 1\n\nfish $repoPath/compile.fish\nor exit 1\n\nrm -rf $repoPath\necho "fish_add_path ~/.fsysutils" >> ~/.config/fish/config.fish', { status: 200 })
		}

		if (url.pathname === '/' || !url.pathname) {
			return getResponseJson(406, 'This is an API and is not meant to be used as a webpage.');
		}

		return notFound();
	},
} satisfies ExportedHandler<Env>;

export function getResponseJson(status: number, detailed: string | null, extraHeaders = {}) {
	return new Response(
		detailed === null
			? null
			: JSON.stringify({
				status: status,
				message: STATUS_CODES[status],
				detailed: detailed,
			}),
		{
			status: status,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
				...extraHeaders,
			},
		},
	);
}

export function notFound() {
	return getResponseJson(404, 'The requested URL was not found.');
}
