import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
  deliveryUpdate: vi.fn(),
  from: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.sendNotification
  }
}));
vi.mock("./supabaseAdmin", () => ({
  createSupabaseAdmin: () => ({ from: mocks.from })
}));

import { sendTrackedPush } from "./pushNotifications";

const originalVapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const originalVapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const originalVapidSubject = process.env.VAPID_SUBJECT;

describe("sendTrackedPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;

    mocks.from.mockImplementation((table: string) => {
      if (table === "notification_dispatches") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: "dispatch-1" },
                error: null
              })
            })
          })
        };
      }
      if (table === "push_subscriptions") {
        return {
          select: () =>
            Promise.resolve({
              data: [
                {
                  id: "subscription-1",
                  user_id: "user-1",
                  endpoint: "https://push.example/device",
                  p256dh_key: "p256dh",
                  auth_key: "auth"
                }
              ],
              error: null
            })
        };
      }
      if (table === "notification_preferences") {
        return {
          select: () => ({
            in: async () => ({ data: [], error: null })
          })
        };
      }
      if (table === "notification_deliveries") {
        return {
          insert: () => ({
            select: async () => ({
              data: [
                {
                  id: "delivery-1",
                  subscription_id: "subscription-1"
                }
              ],
              error: null
            })
          }),
          update: (values: unknown) => {
            mocks.deliveryUpdate(values);
            return {
              in: async () => ({ data: null, error: null })
            };
          }
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  afterEach(() => {
    if (originalVapidPublicKey === undefined) {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    } else {
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalVapidPublicKey;
    }
    if (originalVapidPrivateKey === undefined) {
      delete process.env.VAPID_PRIVATE_KEY;
    } else {
      process.env.VAPID_PRIVATE_KEY = originalVapidPrivateKey;
    }
    if (originalVapidSubject === undefined) {
      delete process.env.VAPID_SUBJECT;
    } else {
      process.env.VAPID_SUBJECT = originalVapidSubject;
    }
  });

  it("records configuration failures as retryable delivery failures", async () => {
    await expect(
      sendTrackedPush({
        type: "lineups_ready",
        payload: {
          title: "Lineups ready",
          body: "Set your team."
        }
      })
    ).resolves.toEqual({
      dispatchId: "dispatch-1",
      total: 1,
      sent: 0,
      failed: 1,
      removed: 0
    });

    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(mocks.deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        attempt_count: 1,
        error_message: "VAPID configuration is incomplete."
      })
    );
  });
});
