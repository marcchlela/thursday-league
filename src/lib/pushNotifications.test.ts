import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
  deliveryUpdate: vi.fn(),
  nativeDelete: vi.fn(),
  webTargets: [] as Array<Record<string, string>>,
  nativeTargets: [] as Array<Record<string, string>>,
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

import { classifyExpoReceipt, sendTrackedPush } from "./pushNotifications";

const originalVapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const originalVapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const originalVapidSubject = process.env.VAPID_SUBJECT;

describe("sendTrackedPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    mocks.webTargets = [{
      id: "subscription-1",
      user_id: "user-1",
      endpoint: "https://push.example/device",
      p256dh_key: "p256dh",
      auth_key: "auth"
    }];
    mocks.nativeTargets = [];

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
          select: () => ({
            in: () => Promise.resolve({
              data: mocks.webTargets,
              error: null
            })
          })
        };
      }
      if (table === "native_push_tokens") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: mocks.nativeTargets, error: null })
          }),
          delete: () => ({
            eq: async (_column: string, id: string) => {
              mocks.nativeDelete(id);
              return { data: null, error: null };
            }
          })
        };
      }
      if (table === "league_memberships") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [{ user_id: "user-1" }],
                error: null
              })
            })
          })
        };
      }
      if (table === "notification_preferences") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [], error: null })
            })
          })
        };
      }
      if (table === "notification_deliveries") {
        return {
          insert: (rows: Array<{ subscription_id?: string | null; native_push_token_id?: string | null }>) => ({
            select: async () => ({
              data: rows.map((row, index) => ({ id: `delivery-${index + 1}`, ...row })),
              error: null
            })
          }),
          update: (values: unknown) => {
            mocks.deliveryUpdate(values);
            return {
              eq: async () => ({ data: null, error: null })
            };
          }
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
        leagueId: "league-1",
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

  it("delivers native notifications through Expo with the safe route payload", async () => {
    mocks.webTargets = [];
    mocks.nativeTargets = [{
      id: "native-1",
      user_id: "user-1",
      expo_push_token: "ExpoPushToken[abcdefghijklmnopqrstuvwxyz123456]"
    }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: "ok", id: "expo-ticket-1" } })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTrackedPush({
      leagueId: "league-1",
      type: "new_game",
      payload: {
        title: "New game",
        body: "Thursday at 10:00 PM",
        url: "/l/weekly/games/game-1",
        tag: "game-1"
      }
    })).resolves.toEqual({
      dispatchId: "dispatch-1",
      total: 1,
      sent: 1,
      failed: 0,
      removed: 0
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"url":"/l/weekly/games/game-1"')
      })
    );
    expect(mocks.deliveryUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "sent",
      provider_ticket_id: "expo-ticket-1"
    }));
  });

  it("classifies provider receipts without leaking dead device tokens", () => {
    expect(classifyExpoReceipt({ status: "ok" })).toEqual({ status: "sent", expired: false, error: null });
    expect(classifyExpoReceipt({
      status: "error",
      message: "Device is no longer registered.",
      details: { error: "DeviceNotRegistered" }
    })).toEqual({
      status: "expired",
      expired: true,
      error: "Device is no longer registered."
    });
    expect(classifyExpoReceipt({ status: "error", details: { error: "MismatchSenderId" } })).toEqual({
      status: "failed",
      expired: false,
      error: "MismatchSenderId"
    });
  });
});
