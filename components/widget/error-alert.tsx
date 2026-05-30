import { Alert } from "react-bootstrap";

interface ErrorAlertProps {
	error?: unknown;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	return error ? JSON.stringify(error) : "Unknown error";
}

export function ErrorAlert({ error }: ErrorAlertProps) {
	return <Alert variant="danger">{getErrorMessage(error)}</Alert>;
}
