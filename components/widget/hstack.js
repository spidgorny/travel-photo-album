import { Stack } from "react-bootstrap";

export function HStack({ className, children, gap }) {
  return (
    <Stack
      direction="horizontal"
      className={className ?? "justify-content-between"}
      gap={gap}
    >
      {children}
    </Stack>
  );
}
