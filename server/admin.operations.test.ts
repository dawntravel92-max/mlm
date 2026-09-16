import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("admin.operations", () => {
  it("rejects a signed-in non-admin without touching telemetry data", async () => {
    const ctx: TrpcContext = {
      user: {
        id: 7,
        openId: "non-admin",
        email: "user@example.com",
        name: "User",
        loginMethod: "test",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    await expect(
      appRouter.createCaller(ctx).admin.operations()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
