import type { ReactNode } from "react";
import { HStack } from "./hstack";

interface CenterProps {
	children?: ReactNode;
}

export function Center({ children }: CenterProps) {
	return (
		<HStack className="vh-100 justify-content-center">
			<div>{children}</div>
		</HStack>
	);
}
