import { Hono } from "hono";
import type { AppVariables } from "../app";

export const me = new Hono<{ Variables: AppVariables }>().get("/", (c) => {
  const user = c.var.user;
  return c.json({
    user:
      user === null
        ? null
        : {
            id: user.id,
            email: user.email,
            name: user.name,
          },
  });
});
