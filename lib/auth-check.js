import { getSession } from "next-auth/react";

export async function requiresAuth(req) {
  const session = await getSession({ req });

  if (req.method === "GET") {
    return;
  }

  if (!session) {
    throw new Error("access denied");
  }

  const user = session.user;
  if (!user) {
    throw new Error("access denied");
  }

  const pathname = req.url;
  // console.log({pathname, permissions, match});
  if (false) {
    throw new Error(
      `access denied for user [${user.email}] to path [${pathname}]`
    );
  }

  // ok, permissions are ok
}
