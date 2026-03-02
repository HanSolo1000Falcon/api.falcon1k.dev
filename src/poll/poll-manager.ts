/*
 * Incredibly exploitable implementation letting basically anyone flood the database as much as they want.
 * But I trust that anyone reading this codebase is invested enough in my personal projects not to ruin it.
 *
 * If you feel the need to exploit this though, seriously? Why would you want to exploit this API I'm writing for fun
 * and intentionally making open source on GitHub so others can learn from my (subpar) code?
 */

import { getResponseJson, notFound } from '../index';

export async function handlePollRequest(request: Request, env: Env) {
	const url = new URL(request.url);
	const pathname = url.pathname.replace('/poll', '');

	switch (pathname) {
		case '/current':
			const currentPoll = await env.POLL_KV.get('CurrentPoll', { type: 'json' });

			return new Response(JSON.stringify(currentPoll), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});

		case '/upload':
			return await handlePollUpload(request, env);

		case '/manage':
			if (request.method === 'OPTIONS') {
				return getResponseJson(204, null, {
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
				});
			}

			if (request.method !== 'POST') {
				return getResponseJson(405, 'You can only send POST requests to this URL');
			}

			const suppliedSecret: string | null = request.headers.get('X-Auth-Key');
			if (suppliedSecret !== env.SECRET_KEY) {
				return getResponseJson(
					401,
					'Unauthorized. You must provide the correct secret key in the X-Auth-Key header to access this endpoint.',
				);
			}

			const body: { pollName: string; options: string[] } = await request.json();
			if (
				body &&
				typeof body.pollName === 'string' &&
				Array.isArray(body.options) &&
				body.options.every((option) => typeof option === 'string')
			) {
				await env.POLL_KV.put('CurrentPoll', JSON.stringify(body));
				return getResponseJson(200, 'Successfully updated the current poll.');
			} else {
				return getResponseJson(400, 'Missing or malformed request body. Make sure to send a valid JSON body with the poll data.');
			}

		case '/fetch':
			const json: Record<string, JSON> = {};

			// Wrapped this in a try catch because it used to throw when I forgot to await the D1 call.
			// I'll keep the try catch though because it might throw again, who knows?
			try {
				const polls: { results: { PollName: string; JsonData: string }[] } = await env.DB.prepare('SELECT * FROM Polls').all();

				for (const row of polls.results) {
					try {
						const parsed = JSON.parse(row.JsonData);
						const pollName = row.PollName;
						json[pollName] = parsed;
					} catch {
						// Ignored
					}
				}
			} catch {
				return getResponseJson(500, "Couldn't find polls.");
			}

			return new Response(JSON.stringify(json), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
	}

	return notFound();
}

async function handlePollUpload(request: Request, env: Env) {
	if (request.method === 'OPTIONS') {
		return getResponseJson(204, null, {
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
		});
	}

	if (request.method !== 'POST') {
		return getResponseJson(405, 'You can only send POST requests to this URL');
	}

	let json: { votedFor: number } | null = null;

	try {
		json = await request.json();
	} catch (e) {
		return getResponseJson(400, `Failed to read request body. Make sure you are sending a valid JSON body. Error details: ${e}`);
	}

	if (!json || typeof json.votedFor !== 'number') {
		return getResponseJson(
			400,
			`Missing or malformed request body. Make sure you are sending a JSON body with a 'votedFor' property that is a number. Example: { "votedFor": 0 }`,
		);
	}

	const current: { pollName: string; options: string[] } | null = await env.POLL_KV.get('CurrentPoll', { type: 'json' });

	if (!current) {
		return getResponseJson(400, 'There is no active poll to vote for.');
	}

	if (json.votedFor < 0 || json.votedFor >= current.options.length) {
		return getResponseJson(400, "Correct request body but 'votedFor' was out of the bounds of the 'options' array.");
	}

	const row: { JsonData: string } | null = await env.DB.prepare('SELECT JsonData FROM Polls WHERE PollName = ?')
		.bind(current.pollName)
		.first();
	let currentPollData;
	if (!row || !row.JsonData) {
		currentPollData = { votes: [] };
	} else {
		currentPollData = JSON.parse(row.JsonData);
		if (!currentPollData.votes) {
			currentPollData.votes = [];
		}
	}

	currentPollData.votes.push(json.votedFor);
	await env.DB.prepare(
		'INSERT INTO Polls(PollName, JsonData) VALUES (?, ?) ON CONFLICT(PollName) DO UPDATE SET JsonData = excluded.JsonData',
	)
		.bind(current.pollName, JSON.stringify(currentPollData))
		.run();

	return getResponseJson(200, 'Successfully voted.');
}
