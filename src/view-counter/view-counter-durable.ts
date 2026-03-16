import { DurableObject } from 'cloudflare:workers';

export class ViewCounterDO extends DurableObject {
	private ctxLocal: DurableObjectState;
	private envLocal: Env;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctxLocal = ctx;
		this.envLocal = env;
	}

	async incrementAndGet(): Promise<number> {
		let currentViews: number = (await this.ctxLocal.storage.get('currentViews')) ?? 0;
		currentViews++;
		await this.ctxLocal.storage.put('currentViews', currentViews);
		return currentViews;
	}
}
