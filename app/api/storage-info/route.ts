import { NextResponse } from "next/server";
import { jsonError } from "../../../lib/api-route";
import { getThumbStorageInfo } from "../../../lib/storage-info";

export const runtime = "nodejs";

export async function GET() {
	try {
		return NextResponse.json(
			{
				storage: await getThumbStorageInfo(),
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
