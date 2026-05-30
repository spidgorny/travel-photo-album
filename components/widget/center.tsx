import type { ReactNode } from "react";
import { HStack } from "./hstack";

interface CenterProps {
	children?: ReactNode;
}

export function Center({ children }: CenterProps) {
	return (
		<HStack className="min-h-screen justify-center">
			<div>{children}</div>
		</HStack>
	);
}
