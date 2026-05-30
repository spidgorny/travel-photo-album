import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Center } from "./center";
import { Loading } from "./loading";

interface CheckAuthProps {
	children?: ReactNode;
}

export function CheckAuth({ children }: CheckAuthProps) {
	const { data: session } = useSession();

	if (typeof session === "undefined") {
		return (
			<Center>
				<Loading />
			</Center>
		);
	}

	return <>{children}</>;
}
