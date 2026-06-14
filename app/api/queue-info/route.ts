import { NextResponse } from "next/server";
import { jsonError } from "../../../lib/api/api-route";
import { getQueueInfo } from "../../../lib/system/queue-info";

export const runtime = "nodejs";

export async function GET() {
	try {
		return NextResponse.json(
			{
				queue: await getQueueInfo(),
				updatedAt: new Date().toISOString(),
			},
			{
				headers: {
					"Cache-Control": "no-store",
				},
			},
		);
	} catch (error) {
		return NextResponse.json(jsonError(error), { status: 500 });
	}
}
