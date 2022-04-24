import { Alert } from "react-bootstrap";

export function ErrorAlert({ error }) {
  return <Alert variant="danger">{error?.message ?? error}</Alert>;
}
