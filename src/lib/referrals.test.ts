import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReferralProgram, ReferredBusiness } from "./api/hooks.ts";
import {
  earnedTile,
  payingSub,
  progressOf,
  referralLink,
  referralLinkParts,
  rewardView,
  rowLabel,
  shareUrls,
  shortDate,
  statusView,
} from "./referrals.ts";

const TZ = "Europe/London";
const NOW = new Date("2026-10-21T10:00:00Z");

function row(over: Partial<ReferredBusiness> = {}): ReferredBusiness {
  return {
    id: "r1",
    name: "Shine Mobile Valeting",
    industryTemplateKey: "car_detailing",
    signedUpAt: "2026-10-02T09:00:00Z",
    status: "trial",
    trialEndsAt: "2026-10-30T09:00:00Z",
    endedAt: null,
    firstPaidAt: null,
    program: "standard",
    reward: {
      status: "waiting",
      appliesAt: null,
      appliesTo: null,
      appliedAt: null,
      amountMinor: null,
      currency: null,
    },
    ...over,
  };
}

describe("referral link", () => {
  it("uses the API's origin with the short /join path", () => {
    assert.equal(
      referralLink("https://staging.book.recavo.app/register?ref=F5SJ-WAAU", "F5SJ-WAAU"),
      "https://staging.book.recavo.app/join/F5SJ-WAAU",
    );
    assert.equal(
      referralLink("/register?ref=F5SJ-WAAU", "F5SJ-WAAU", "http://localhost:8080"),
      "http://localhost:8080/join/F5SJ-WAAU",
    );
  });

  it("splits the shown link so the code can be bold", () => {
    assert.deepEqual(referralLinkParts("https://book.recavo.app/join/F5SJ-WAAU"), {
      prefix: "book.recavo.app/join/",
      code: "F5SJ-WAAU",
    });
  });

  it("builds the share targets with the message", () => {
    const urls = shareUrls("https://book.recavo.app/join/F5SJ-WAAU", 14);
    assert.ok(
      decodeURIComponent(urls.whatsapp).includes(
        "Try it free for 14 days with my link: https://book.recavo.app/join/F5SJ-WAAU",
      ),
    );
    assert.match(urls.email, /^mailto:\?subject=Try%20RECAVO%20for%20your%20bookings&body=/);
    assert.ok(urls.sms.startsWith("sms:?&body="));
  });
});

describe("shortDate", () => {
  it("drops the year only for this year", () => {
    assert.equal(shortDate("2026-10-16T12:00:00Z", TZ, NOW), "16 Oct");
    assert.equal(shortDate("2025-06-26T12:00:00Z", TZ, NOW), "26 Jun 2025");
  });
});

describe("status and reward", () => {
  it("counts trial days left", () => {
    const status = statusView(row(), TZ, NOW);
    assert.equal(status.label, "On free trial");
    assert.equal(status.line, "9 days left");
    assert.deepEqual(rewardView(row(), TZ, NOW), {
      main: "Waiting",
      sub: "When they pay",
      tone: "muted",
    });
  });

  it("dates a pending reward to the invoice", () => {
    const r = row({
      status: "paying",
      firstPaidAt: "2026-10-16T10:00:00Z",
      reward: {
        status: "pending",
        appliesAt: "2026-11-03T00:00:00Z",
        appliesTo: "invoice",
        appliedAt: null,
        amountMinor: 2900,
        currency: "GBP",
      },
    });
    assert.equal(statusView(r, TZ, NOW).line, "First invoice paid 16 Oct");
    assert.deepEqual(rewardView(r, TZ, NOW), {
      main: "1 month free",
      sub: "Off your 3 Nov invoice",
      tone: "amber",
    });
  });

  it("shows an applied reward with its value", () => {
    const r = row({
      status: "paying",
      firstPaidAt: "2026-09-11T10:00:00Z",
      reward: {
        status: "applied",
        appliesAt: null,
        appliesTo: null,
        appliedAt: "2026-10-03T00:00:00Z",
        amountMinor: 2900,
        currency: "GBP",
      },
    });
    assert.equal(statusView(r, TZ, NOW).line, "Since 11 Sept");
    assert.equal(rewardView(r, TZ, NOW)?.sub, "Applied 3 Oct · £29");
  });

  it("fades trials that ended unpaid and explains cancellations", () => {
    const ended = statusView(
      row({ status: "not_converted", endedAt: "2026-06-26T00:00:00Z" }),
      TZ,
      NOW,
    );
    assert.equal(ended.label, "Didn't sign up");
    assert.equal(ended.line, "Trial ended 26 Jun");
    assert.equal(ended.faded, true);
    const none = { ...row().reward!, status: "none" as const };
    const cancelled = row({ status: "cancelled", endedAt: "2026-09-12T00:00:00Z", reward: none });
    assert.equal(statusView(cancelled, TZ, NOW).line, "Cancelled 12 Sept");
    assert.equal(rewardView(cancelled, TZ, NOW)?.sub, "Cancelled before their first invoice");
  });

  it("hides the reward without billing access", () => {
    assert.equal(rewardView(row({ reward: null }), TZ, NOW), null);
  });

  it("reads the row in full", () => {
    assert.equal(
      rowLabel(row(), TZ, NOW),
      "Shine Mobile Valeting, automotive, signed up 2 October, on free trial, 9 days left, waiting when they pay",
    );
  });
});

describe("progress", () => {
  const program: ReferralProgram = {
    program: "standard",
    code: "F5SJ-WAAU",
    sharePath: "/register?ref=F5SJ-WAAU",
    stats: { attributedCount: 3, convertedCount: 2, pendingRewardCount: 1, rewardedCount: 1 },
  };

  it("falls back to the old counts on older APIs", () => {
    const p = progressOf(program);
    assert.equal(p.signedUpCount, 3);
    assert.equal(p.onTrialCount, 1);
    assert.equal(p.payingCount, 2);
    assert.equal(p.freeMonthsEarned, 1);
    assert.equal(p.savedMinor, null);
  });

  it("leads with months and savings, then the next reward", () => {
    const summary = {
      signedUpCount: 5,
      onTrialCount: 1,
      payingCount: 3,
      pendingRewardCount: 1,
      freeMonthsEarned: 2,
      savedMinor: 5800,
      currency: "GBP",
      nextReward: { at: "2026-11-03T00:00:00Z", appliesTo: "invoice" as const },
    };
    assert.deepEqual(earnedTile(summary, TZ, NOW), {
      value: "2 · £58 saved",
      sub: "Next one comes off your 3 Nov invoice",
      short: "Next one comes off 3 Nov",
    });
    assert.equal(payingSub(summary), "1 reward on its way");
    assert.equal(
      earnedTile(
        { ...summary, nextReward: { at: "2027-12-03T00:00:00Z", appliesTo: "renewal" } },
        TZ,
        NOW,
      ).sub,
      "Your renewal moves to 3 Dec 2027",
    );
    assert.equal(
      earnedTile({ ...summary, pendingRewardCount: 0, nextReward: null }, TZ, NOW).sub,
      "Share your link to earn more",
    );
    assert.equal(payingSub({ ...summary, pendingRewardCount: 0 }), "All rewards applied");
  });
});
