import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCalendar, type CalendarSession } from "@/components/SessionCalendar";

/**
 * The grid is built from "now", so every case pins the clock. March 2026 is a
 * useful default: the 1st is a Sunday, which puts it in the *last* column of
 * the leading week and makes an off-by-one in the Monday-first offset obvious.
 */
const NOW = new Date("2026-03-11T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const session = (over: Partial<CalendarSession> = {}): CalendarSession => ({
  id: "ses_1",
  start: "2026-03-11T10:00:00.000Z",
  timezone: "Europe/London",
  title: "Strength 1:1",
  studio: "Northside",
  status: "confirmed",
  ...over,
});

/** The month grid, as opposed to the selected-day panel beside it. */
const monthGrid = () => document.querySelectorAll<HTMLButtonElement>("button[class*='min-h-']");

const dayCell = (dayNumber: string) =>
  [...monthGrid()].find((cell) => cell.querySelector("span")?.textContent === dayNumber);

describe("month grid", () => {
  it("opens on the current month", () => {
    render(<SessionCalendar sessions={[]} />);
    expect(screen.getByRole("heading", { name: "March 2026" })).toBeInTheDocument();
  });

  it("always draws six weeks, so paging does not resize the page", () => {
    // Six rows of seven. February 2026 needs only five, and letting the grid
    // shrink makes everything below it jump as you page through.
    render(<SessionCalendar sessions={[]} />);
    expect(monthGrid()).toHaveLength(42);
  });

  it("starts the week on Monday", () => {
    render(<SessionCalendar sessions={[]} />);
    const headings = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (const day of headings) expect(screen.getByText(day)).toBeInTheDocument();

    // 1 March 2026 is a Sunday, so the grid must open on Monday 23 February.
    const first = monthGrid()[0];
    expect(first?.querySelector("span")?.textContent).toBe("23");
  });
});

describe("navigation", () => {
  it("steps back and forward a month at a time", async () => {
    const user = userEvent.setup();
    render(<SessionCalendar sessions={[]} />);

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { name: "February 2026" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "April 2026" })).toBeInTheDocument();
  });

  it("rolls the year over at each end", async () => {
    const user = userEvent.setup();
    render(<SessionCalendar sessions={[]} />);

    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole("button", { name: "Previous month" }));
    }
    expect(screen.getByRole("heading", { name: "December 2025" })).toBeInTheDocument();
  });

  it("comes back to today", async () => {
    const user = userEvent.setup();
    render(<SessionCalendar sessions={[session()]} />);

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getByRole("heading", { name: "March 2026" })).toBeInTheDocument();
    // Today is reselected too, so the panel returns to the day it opened on.
    expect(screen.getByRole("heading", { name: "Wednesday 11 March" })).toBeInTheDocument();
  });
});

describe("bucketing by the studio's timezone", () => {
  it("keeps a late session on the studio's day, not the viewer's", () => {
    // 23:30 UTC on 11 March is 00:30 on the 12th in Madrid. A Spanish studio
    // expects that client on the 12th, so that is the cell it belongs in — the
    // viewer's own clock must not move it.
    render(
      <SessionCalendar
        sessions={[
          session({ id: "madrid", start: "2026-03-11T23:30:00.000Z", timezone: "Europe/Madrid" }),
        ]}
      />,
    );

    expect(within(dayCell("12")!).getByText(/Strength 1:1/)).toBeInTheDocument();
    expect(within(dayCell("11")!).queryByText(/Strength 1:1/)).not.toBeInTheDocument();
  });

  it("shows each session at its own local time", () => {
    render(
      <SessionCalendar
        sessions={[
          session({ id: "london", timezone: "Europe/London", title: "London" }),
          session({ id: "madrid", timezone: "Europe/Madrid", title: "Madrid" }),
        ]}
      />,
    );

    // The same 10:00 UTC instant: 10:00 in London (still GMT in early March),
    // 11:00 in Madrid.
    const cell = within(dayCell("11")!);
    expect(cell.getByText(/10:00 London/)).toBeInTheDocument();
    expect(cell.getByText(/11:00 Madrid/)).toBeInTheDocument();
  });
});

describe("a busy day", () => {
  const busy = [
    session({ id: "a", start: "2026-03-11T14:00:00.000Z", title: "Third" }),
    session({ id: "b", start: "2026-03-11T08:00:00.000Z", title: "First" }),
    session({ id: "c", start: "2026-03-11T10:00:00.000Z", title: "Second" }),
    session({ id: "d", start: "2026-03-11T16:00:00.000Z", title: "Fourth" }),
  ];

  it("lists the earliest two and counts the rest", () => {
    render(<SessionCalendar sessions={busy} />);
    const cell = within(dayCell("11")!);
    expect(cell.getByText(/First/)).toBeInTheDocument();
    expect(cell.getByText(/Second/)).toBeInTheDocument();
    expect(cell.queryByText(/Third/)).not.toBeInTheDocument();
    expect(cell.getByText("+2 more")).toBeInTheDocument();
  });

  it("orders the day panel by start time regardless of input order", () => {
    render(<SessionCalendar sessions={busy} />);
    const panel = screen.getByRole("heading", { name: "Wednesday 11 March" }).closest("section")!;
    const titles = [...panel.querySelectorAll("p.font-medium")].map((p) => p.textContent);
    expect(titles).toEqual(["First", "Second", "Third", "Fourth"]);
  });
});

describe("selected day panel", () => {
  it("opens on today", () => {
    render(<SessionCalendar sessions={[session()]} />);
    expect(screen.getByRole("heading", { name: "Wednesday 11 March" })).toBeInTheDocument();
    expect(screen.getByText("Northside", { exact: false })).toBeInTheDocument();
  });

  it("follows the day you click, including one outside the month", async () => {
    const user = userEvent.setup();
    render(<SessionCalendar sessions={[]} />);

    await user.click(dayCell("23")!); // the leading Monday, 23 February
    expect(screen.getByRole("heading", { name: "Monday 23 February" })).toBeInTheDocument();
  });

  it("explains an empty day, in the caller's words when given", () => {
    render(<SessionCalendar sessions={[]} emptyHint="No sessions booked yet." />);
    expect(screen.getByText("No sessions booked yet.")).toBeInTheDocument();
  });

  it("falls back to its own wording", () => {
    render(<SessionCalendar sessions={[]} />);
    expect(screen.getByText("Nothing booked on this day.")).toBeInTheDocument();
  });
});
