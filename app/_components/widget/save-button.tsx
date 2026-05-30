"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import React, { useState } from "react";
import { HStack } from "./hstack";

type NativeButtonProps = Omit<
	React.ButtonHTMLAttributes<HTMLButtonElement>,
	"children" | "className" | "disabled" | "onClick" | "style" | "type"
>;

interface SaveButtonProps {
	onClick?: (event: MouseEvent<HTMLButtonElement>) => Promise<unknown> | unknown;
	children?: ReactNode;
	buttonProps?: NativeButtonProps;
	forceRunning?: boolean;
	forceEnable?: boolean;
	disabled?: boolean;
	className?: string;
	variant?: "primary" | "secondary" | "danger" | "outline" | "ghost";
	type?: React.ButtonHTMLAttributes<HTMLButtonElement>["type"];
	size?: "sm" | "md" | "lg";
	style?: CSSProperties;
}

const variantClasses: Record<NonNullable<SaveButtonProps["variant"]>, string> = {
	primary:
		"border-sky-400/40 bg-sky-400/15 text-white hover:border-sky-300/50 hover:bg-sky-400/20",
	secondary:
		"border-white/15 bg-white/[0.05] text-slate-100 hover:border-white/25 hover:bg-white/[0.08]",
	danger:
		"border-rose-400/40 bg-rose-400/15 text-rose-100 hover:border-rose-300/50 hover:bg-rose-400/20",
	outline:
		"border-white/20 bg-transparent text-slate-100 hover:border-white/30 hover:bg-white/[0.05]",
	ghost:
		"border-transparent bg-transparent text-slate-200 hover:border-white/10 hover:bg-white/[0.05]",
};

const sizeClasses: Record<NonNullable<SaveButtonProps["size"]>, string> = {
	sm: "min-h-9 px-3 text-sm",
	md: "min-h-10 px-4 text-sm",
	lg: "min-h-12 px-5 text-base",
};

export function SaveButton(props: SaveButtonProps) {
	const [working, setWorking] = useState(false);

	const onClick = async (event: MouseEvent<HTMLButtonElement>) => {
		setWorking(true);
		try {
			if (props.onClick) {
				await props.onClick(event);
			}
		} finally {
			setWorking(false);
		}
	};

	const isWorking = working || props.forceRunning;
	let isDisabled = isWorking;
	if (props.forceEnable) {
		isDisabled = false;
	}

	return (
		<button
			className={[
				"inline-flex items-center justify-center rounded-2xl border font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
				sizeClasses[props.size ?? "md"],
				variantClasses[props.variant ?? "primary"],
				props.className ?? "",
			].join(" ")}
			onClick={onClick}
			disabled={props.disabled || isDisabled}
			type={props.type ?? "button"}
			style={props.style}
			{...(props.buttonProps ?? {})}
		>
			<HStack className="justify-center gap-2">
				{isWorking && (
					<span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
				)}
				<span>{props.children}</span>
			</HStack>
		</button>
	);
}
