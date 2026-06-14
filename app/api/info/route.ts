import { NextResponse } from "next/server";
import { jsonError } from "../../../lib/api/api-route";
import { getQueueInfo } from "../../../lib/system/queue-info";
import { getThumbStorageInfo } from "../../../lib/system/storage-info";

export const runtime = "nodejs";

export async function GET() {
	try {
		const [queue, storage] = await Promise.all([
			getQueueInfo(),
			getThumbStorageInfo(),
		]);

		return NextResponse.json({
			queue,
			storage,
			updatedAt: new Date().toISOString(),
		});
	} catch (error) {
		return NextResponse.json(jsonError(error), { status: 500 });
	}
}
