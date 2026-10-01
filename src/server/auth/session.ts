import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "./options";

/**
 * The signed-in session, resolved once per server render. Resolving it runs
 * the session checks in options.ts (idle limit, single session, account
 * state), which read the database; a page's layout, its permission checks
 * and the page itself all ask for it, so without this each request repeated
 * that work several times. Outside a server render (route handlers, tests)
 * React's cache doesn't memoize and this is a plain call.
 *
 * Always use this, never getServerSession directly.
 */
export const getSession = cache(() => getServerSession(authOptions));
