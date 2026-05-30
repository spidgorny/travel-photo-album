import type { CSSProperties, MouseEvent, ReactNode } from "react";
import React, { useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import { HStack } from "./hstack";

type BootstrapButtonProps = React.ComponentProps<typeof Button>;

interface SaveButtonProps {
	onClick?: (event: MouseEvent<HTMLButtonElement>) => Promise<unknown> | unknown;
	children?: ReactNode;
	buttonProps?: BootstrapButtonProps;
	forceRunning?: boolean;
	forceEnable?: boolean;
	disabled?: boolean;
	className?: string;
	variant?: BootstrapButtonProps["variant"];
	type?: BootstrapButtonProps["type"];
	size?: BootstrapButtonProps["size"];
	style?: CSSProperties;
}

export function SaveButton(props: SaveButtonProps) {
	const [working, setWorking] = useState(false);

	const onClick = async (event: MouseEvent<HTMLButtonElement>) => {
		setWorking(true);
		if (props.onClick) {
			await props.onClick(event);
		}
		setWorking(false);
	};

	const isWorking = working || props.forceRunning;
	let isDisabled = isWorking || props.buttonProps?.disabled;
	if (props.forceEnable) {
		isDisabled = false;
	}

	return (
		<Button
			className={props.className}
			onClick={onClick}
			variant={props.variant}
			disabled={props.disabled || isDisabled}
			type={props.type ?? "button"}
			size={props.size ?? props.buttonProps?.size}
			style={props.style ?? props.buttonProps?.style}
			{...(props.buttonProps ?? {})}
		>
			<HStack className="justify-content-center">
				{isWorking && <Spinner animation="border" size="sm" className="me-2" />}
				<span>{props.children}</span>
			</HStack>
		</Button>
	);
}
