/*
* Incredibly exploitable implementation letting basically anyone flood the database as much as they want.
* But I trust that anyone reading this codebase is invested enough in my personal projects not to ruin it.
*
* If you feel the need to exploit this though, seriously? Why would you want to exploit this API I'm writing for fun
* and intentionally making open source on GitHub so others can learn from my (subpar) code?
*/

import {getResponseJson, notFound} from '../index';
import current from './current.json';

export async function handlePollRequest(request, env) {
	const url = new URL(request.url);
	const pathname = url.pathname.replace('/poll', '');

	switch (pathname) {
		case '/current':
			return new Response(JSON.stringify(current), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
				}
			});

		case '/upload':
			return await handlePollUpload(request, env);

		case '/fetch':
			const json = {};

			// Wrapped this in a try catch because it used to throw when I forgot to await the D1 call.
			// I'll keep the try catch though because it might throw again, who knows?
			try {
				const polls = await env.DB.prepare('SELECT * FROM Polls').all();

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
				return getResponseJson(500, 'Couldn\'t find polls.');
			}

			return new Response(JSON.stringify(json), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
				}
			});
	}

	return notFound();
}

async function handlePollUpload(request, env) {
	if (request.method !== 'POST') {
		return getResponseJson(405, 'You can only send POST requests to this URL');
	}

	let json;

	try {
		json = await request.json();
	} catch {
		return getResponseJson(400, `Failed to read request body. (Expected something like ${JSON.stringify({votedFor: -1})})`);
	}

	if (!json || typeof json.votedFor !== 'number') {
		return getResponseJson(400, `Missing or malformed request body. (Expected something like ${JSON.stringify({votedFor: -1})})`);
	}

	if (json.votedFor < 0 || json.votedFor >= current.options.length) {
		return getResponseJson(400, 'Correct request body but \'votedFor\' was out of the bounds of the \'options\' array.');
	}

	const row = await env.DB.prepare('SELECT JsonData FROM Polls WHERE PollName = ?').bind(current.pollName).first();
	let currentPollData;
	if (!row || !row.JsonData) {
		currentPollData = {votes: []};
	} else {
		currentPollData = JSON.parse(row.JsonData);
		if (!currentPollData.votes) {
			currentPollData.votes = [];
		}
	}

	currentPollData.votes.push(json.votedFor);
	await env.DB.prepare('INSERT INTO Polls(PollName, JsonData) VALUES (?, ?) ON CONFLICT(PollName) DO UPDATE SET JsonData = excluded.JsonData').bind(current.pollName, JSON.stringify(currentPollData)).run();

	return getResponseJson(200, 'Successfully voted.');
}
