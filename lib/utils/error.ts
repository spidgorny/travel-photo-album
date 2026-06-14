export class ErrorWithDetails<TDetails = unknown> extends Error {
	details: TDetails;

	constructor(msg: string, details: TDetails) {
		super(msg);
		this.name = "ErrorWithDetails";
		this.details = details;
	}
}

export class Warning extends Error {
	constructor(message = "Warning") {
		super(message);
		this.name = "Warning";
	}
}
