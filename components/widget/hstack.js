import { Stack } from "react-bootstrap";
import * as cn from "classnames";

export function HStack({ className, children, gap }) {
	return (
		<Stack
			direction="horizontal"
			className={cn(
				className?.includes("justify-content")
					? ""
					: "justify-content-between w-100",
				className
			)}
			gap={gap}
		>
			{children}
		</Stack>
	);
}
