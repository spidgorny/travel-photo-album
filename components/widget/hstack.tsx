import type { ReactNode } from "react";
import cn from "classnames";
import { Stack } from "react-bootstrap";

interface HStackProps {
	className?: string;
	children?: ReactNode;
	gap?: number;
}

export function HStack({ className, children, gap }: HStackProps) {
	return (
		<Stack
			direction="horizontal"
			className={cn(
				className?.includes("justify-content") ? "" : "justify-content-between w-100",
				className,
			)}
			gap={gap}
		>
			{children}
		</Stack>
	);
}
