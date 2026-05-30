import type { ReactNode } from "react";
import cn from "classnames";

interface HStackProps {
	className?: string;
	children?: ReactNode;
	gap?: number;
}

export function HStack({ className, children, gap }: HStackProps) {
	return (
		<div
			className={cn("flex w-full items-center justify-between", className)}
			style={gap ? { gap: `${gap * 0.25}rem` } : undefined}
		>
			{children}
		</div>
	);
}
