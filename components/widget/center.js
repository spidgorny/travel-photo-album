import { HStack } from "./hstack.js";

export function Center({ children }) {
  return (
    <HStack className="vh-100 justify-content-center">
      <div>{children}</div>
    </HStack>
  );
}
