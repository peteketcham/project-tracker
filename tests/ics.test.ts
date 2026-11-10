import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "../src/lib/ics";

const window = {
  timeZone: "America/Chicago",
  from: new Date("2026-11-01T00:00:00Z"),
  to: new Date("2027-01-01T00:00:00Z"),
};
const cal = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const ev = (...lines: string[]) => ["BEGIN:VEVENT", "UID:x", ...lines, "END:VEVENT"].join("\r\n");
const iso = (d: Date) => d.toISOString().slice(0, 16) + "Z";

test("003/US3.1: a UTC event", () => {
  const { events } = parseIcs(
    cal(ev("SUMMARY:Dentist", "DTSTART:20261110T150000Z", "DTEND:20261110T160000Z")),
    window
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Dentist");
  assert.equal(iso(events[0].start), "2026-11-10T15:00Z");
  assert.equal(iso(events[0].end), "2026-11-10T16:00Z");
});

test("003/US3.1: TZID and floating times use the right zone", () => {
  const { events } = parseIcs(
    cal(
      ev("SUMMARY:NY call", "DTSTART;TZID=America/New_York:20261110T090000", "DTEND;TZID=America/New_York:20261110T100000"),
      ev("SUMMARY:Local", "DTSTART:20261111T090000", "DURATION:PT1H30M")
    ),
    window
  );
  assert.equal(iso(events[0].start), "2026-11-10T14:00Z"); // 09:00 EST
  assert.equal(iso(events[1].start), "2026-11-11T15:00Z"); // 09:00 CST
  assert.equal(iso(events[1].end), "2026-11-11T16:30Z");
});

test("003/US3.1: an all-day event covers the local day", () => {
  const { events } = parseIcs(
    cal(ev("SUMMARY:Thanksgiving", "DTSTART;VALUE=DATE:20261126", "DTEND;VALUE=DATE:20261127")),
    window
  );
  assert.equal(iso(events[0].start), "2026-11-26T06:00Z");
  assert.equal(iso(events[0].end), "2026-11-27T06:00Z");
});

test("003/US3.2: free and cancelled events are not busy", () => {
  const { events } = parseIcs(
    cal(
      ev("SUMMARY:FYI", "TRANSP:TRANSPARENT", "DTSTART:20261110T150000Z", "DTEND:20261110T160000Z"),
      ev("SUMMARY:Off", "STATUS:CANCELLED", "DTSTART:20261110T150000Z", "DTEND:20261110T160000Z")
    ),
    window
  );
  assert.equal(events.length, 0);
});

test("003/US3.3: weekly recurrence with BYDAY, COUNT and EXDATE", () => {
  const { events } = parseIcs(
    cal(
      ev(
        "SUMMARY:Practice",
        "DTSTART;TZID=America/Chicago:20261103T173000",
        "DTEND;TZID=America/Chicago:20261103T183000",
        "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5",
        "EXDATE;TZID=America/Chicago:20261105T173000"
      )
    ),
    window
  );
  assert.deepEqual(
    events.map((e) => iso(e.start)),
    ["2026-11-03T23:30Z", "2026-11-10T23:30Z", "2026-11-12T23:30Z", "2026-11-17T23:30Z"]
  );
});

test("003/US3.3: daily recurrence keeps its wall-clock time across DST and stops at UNTIL", () => {
  const { events } = parseIcs(
    cal(
      ev(
        "SUMMARY:Standup",
        "DTSTART;TZID=America/Chicago:20261030T090000",
        "DTEND;TZID=America/Chicago:20261030T091500",
        "RRULE:FREQ=DAILY;UNTIL=20261103T000000Z"
      )
    ),
    { ...window, from: new Date("2026-10-01T00:00:00Z") }
  );
  // Oct 30/31 are CDT (14:00Z); Nov 1/2 are CST (15:00Z)
  assert.deepEqual(
    events.map((e) => iso(e.start)),
    ["2026-10-30T14:00Z", "2026-10-31T14:00Z", "2026-11-01T15:00Z", "2026-11-02T15:00Z"]
  );
});

test("003/US3.3: recurrences are only expanded inside the window", () => {
  const { events } = parseIcs(
    cal(ev("SUMMARY:Forever", "DTSTART:20200101T100000Z", "DTEND:20200101T110000Z", "RRULE:FREQ=MONTHLY")),
    window
  );
  assert.deepEqual(
    events.map((e) => iso(e.start)),
    ["2026-11-01T10:00Z", "2026-12-01T10:00Z"]
  );
});

test("003/US3.4: unsupported rules are counted, not guessed", () => {
  const result = parseIcs(
    cal(ev("SUMMARY:2nd Tue", "DTSTART:20261110T150000Z", "DTEND:20261110T160000Z", "RRULE:FREQ=MONTHLY;BYDAY=2TU")),
    window
  );
  assert.equal(result.events.length, 0);
  assert.equal(result.unsupported, 1);
});

test("folded lines and escaped text are handled; junk is ignored", () => {
  const text = cal(
    "BEGIN:VEVENT\r\nSUMMARY:Lunch\\, with a very long\r\n  title\r\nDTSTART:20261110T180000Z\r\nDTEND:20261110T190000Z\r\nEND:VEVENT",
    ev("SUMMARY:No start")
  );
  const { events } = parseIcs(text, window);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Lunch, with a very long title");
  assert.deepEqual(parseIcs("not a calendar", window), { events: [], unsupported: 0 });
});
