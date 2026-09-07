import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailCode = vi.fn<(email: string) => Promise<void>>();
const verifyEmailCode = vi.fn<(email: string, code: string) => Promise<void>>();
const toastError = vi.fn();

vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({ sendEmailCode, verifyEmailCode }),
}));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

const { EmailCodeSignIn } = await import("@/components/EmailCodeSignIn");

/** Matches the OTP Length configured on the Supabase project. */
const CODE = "12345678";

beforeEach(() => {
  sendEmailCode.mockReset().mockResolvedValue(undefined);
  verifyEmailCode.mockReset().mockResolvedValue(undefined);
  toastError.mockReset();
});

/**
 * Gets to the code step, which is where most of the behaviour lives, and hands
 * back the single real input that `input-otp` renders behind the boxes.
 */
async function requestCode(user: ReturnType<typeof userEvent.setup>, email = "ada@example.com") {
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: /Email me a code/ }));
  return screen.findByLabelText(`Enter the code we sent to ${email}`);
}

/** The eight boxes drawn over that input, which is what a customer sees. */
const codeBoxes = () => document.querySelectorAll("div.h-12.flex-1");

describe("asking for a code", () => {
  it("offers no password and no sign-up choice", () => {
    // Someone who bought as a guest cannot answer "do you have an account?",
    // so the form must not ask. One field, one button.
    render(<EmailCodeSignIn />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign up|register/i })).not.toBeInTheDocument();
  });

  it("prefills an address we already know", () => {
    render(<EmailCodeSignIn defaultEmail="ada@example.com" />);
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("stays disabled until something is typed", async () => {
    const user = userEvent.setup();
    render(<EmailCodeSignIn />);
    const submit = screen.getByRole("button", { name: /Email me a code/ });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    expect(submit).toBeEnabled();
  });

  it("ignores an address that is only whitespace", async () => {
    const user = userEvent.setup();
    render(<EmailCodeSignIn />);
    await user.type(screen.getByLabelText("Email"), "   ");
    expect(screen.getByRole("button", { name: /Email me a code/ })).toBeDisabled();
  });

  it("trims before sending, so a pasted address still works", async () => {
    // Copying an address out of an email client routinely brings a space with
    // it, and Supabase would reject that as malformed.
    const user = userEvent.setup();
    render(<EmailCodeSignIn />);
    await user.type(screen.getByLabelText("Email"), "  ada@example.com  ");
    await user.click(screen.getByRole("button", { name: /Email me a code/ }));
    expect(sendEmailCode).toHaveBeenCalledWith("ada@example.com");
  });

  it("says so when the code could not be sent, and stays on the form", async () => {
    const user = userEvent.setup();
    sendEmailCode.mockRejectedValue(new Error("Email rate limit exceeded"));
    render(<EmailCodeSignIn />);

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: /Email me a code/ }));

    expect(toastError).toHaveBeenCalledWith("Email rate limit exceeded");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});

describe("entering the code", () => {
  it("accepts exactly as many digits as the code has", async () => {
    // Too few boxes and the last digits have nowhere to go; too many and the
    // field never reaches the length that triggers auto-submit. Both the input
    // and the boxes drawn over it have to agree on eight.
    const user = userEvent.setup();
    render(<EmailCodeSignIn />);
    const input = await requestCode(user);
    expect(input).toHaveAttribute("maxlength", "8");
    expect(codeBoxes()).toHaveLength(8);
  });

  it("submits on its own once the last digit lands", async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    render(<EmailCodeSignIn onSignedIn={onSignedIn} />);
    const input = await requestCode(user);

    await user.type(input, CODE);

    await vi.waitFor(() => expect(verifyEmailCode).toHaveBeenCalledWith("ada@example.com", CODE));
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
  });

  it("does not verify a partial code", async () => {
    const user = userEvent.setup();
    render(<EmailCodeSignIn />);
    const input = await requestCode(user);

    await user.type(input, CODE.slice(0, 7));
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  it("clears the boxes on a bad code so the next attempt starts clean", async () => {
    const user = userEvent.setup();
    verifyEmailCode.mockRejectedValue(new Error("Token has expired or is invalid"));
    render(<EmailCodeSignIn />);
    const input = await requestCode(user);

    await user.type(input, CODE);

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Token has expired or is invalid"),
    );
    await vi.waitFor(() => expect(input).toHaveValue(""));
    const filled = [...codeBoxes()].filter((box) => (box.textContent ?? "").trim().length > 0);
    expect(filled).toHaveLength(0);
  });

  it("verifies once when a code is pasted, not twice", async () => {
    // The field submits on its own as soon as it is full, and a paste fills it
    // in one go — without the guard that fires the request twice and the
    // second one fails as a replayed code.
    const user = userEvent.setup();
    render(<EmailCodeSignIn />);
    const input = await requestCode(user);

    input.focus();
    await user.paste(CODE);

    await vi.waitFor(() => expect(verifyEmailCode).toHaveBeenCalled());
    expect(verifyEmailCode).toHaveBeenCalledTimes(1);
  });
});

describe("getting unstuck", () => {
  it("goes back to the address, for a typo", async () => {
    const user = userEvent.setup();
    render(<EmailCodeSignIn />);
    await requestCode(user, "typo@example.com");

    await user.click(screen.getByRole("button", { name: /Use a different email/ }));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("holds the resend button on a countdown", async () => {
    // Supabase rate-limits the send; an enabled button that fails is worse than
    // one that says how long to wait.
    const user = userEvent.setup();
    render(<EmailCodeSignIn />);
    await requestCode(user);

    const resend = screen.getByRole("button", { name: /Resend in \d+s/ });
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent("Resend in 30s");
  });

  it("resends to the same address once the wait is over", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
      render(<EmailCodeSignIn />);
      await requestCode(user);

      // One second at a time, inside act: the countdown schedules its next tick
      // from an effect, so a single 30s jump burns the one timer that exists
      // and stops, and an advance outside act can land before React has
      // re-rendered and queued the following one.
      for (let elapsed = 0; elapsed < 30; elapsed += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
      }

      const resend = await screen.findByRole("button", { name: "Resend code" });
      expect(resend).toBeEnabled();

      await user.click(resend);
      expect(sendEmailCode).toHaveBeenCalledTimes(2);
      expect(sendEmailCode).toHaveBeenLastCalledWith("ada@example.com");
    } finally {
      vi.useRealTimers();
    }
  });
});
