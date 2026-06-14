"use client";

import useSWR from "swr";
import { fetcher } from "../../../lib/api/http";
import { ErrorState, Loading, getErrorMessage } from "../../_components/widget/loading";

export default function TestMetaPage() {
	const { data, error, isLoading, mutate } = useSWR(
		"/api/meta/192.168.1.189/photo/Photos/2022/Marina-5t/2022-03/IMG_20220331_174617.jpg",
		fetcher,
	);

	if (error) {
		return (
			<div className="p-6">
				<ErrorState
					message="Failed to load meta test data."
					error={error}
					details={getErrorMessage(error)}
					onRetry={() => mutate()}
				/>
			</div>
		);
	}

	if (isLoading && !data) {
		return (
			<div className="p-6">
				<Loading />
			</div>
		);
	}

	return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
