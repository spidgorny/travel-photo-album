import { useSession } from "next-auth/react";
import { Loading } from "./loading.js";
import { Center } from "./center.js";

export function CheckAuth({ children }) {
  const { data: session } = useSession();

  if (typeof session === "undefined") {
    return (
      <Center>
        <Loading />
      </Center>
    );
  }

  return <>{children}</>;
}
