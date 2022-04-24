export class ErrorWithDetails extends Error {
    constructor(msg, details) {
        super(msg);
        this.details = details;
    }
}

export class Warning extends Error {}
