interface PhashBitmapProps {
	value?: string;
	className?: string;
}

export function PhashBitmap({ value, className = "" }: PhashBitmapProps) {
	const bits = hexToBits(value);
	if (!bits) {
		return null;
	}

	return (
		<div
			role="img"
			aria-label={`Perceptual hash ${value}`}
			title={`pHash ${value}`}
			className={className}
		>
			<div className="grid grid-cols-8 gap-px rounded-md border border-white/10 bg-slate-950/80 p-1 shadow-lg shadow-black/30 backdrop-blur-sm">
				{bits.map((bit, index) => (
					<span
						key={index}
						className={[
							"h-1.5 w-1.5 rounded-[1px]",
							bit ? "bg-sky-200" : "bg-slate-700/80",
						].join(" ")}
					/>
				))}
			</div>
		</div>
	);
}

function hexToBits(value?: string) {
	if (typeof value !== "string" || !/^[0-9a-f]{16}$/i.test(value)) {
		return null;
	}

	return value
		.toLowerCase()
		.split("")
		.flatMap((digit) =>
			Number.parseInt(digit, 16)
				.toString(2)
				.padStart(4, "0")
				.split("")
				.map((bit) => bit === "1"),
		);
}
