import assert from "node:assert/strict";
import test from "node:test";
import { isReminderDue, isValidIanaTimezone, isValidReminderTime } from "../reminder-validation.ts";

test("reminder time accepts only zero-padded 24-hour HH:MM", () => {
  assert.equal(isValidReminderTime("00:00"), true);
  assert.equal(isValidReminderTime("23:59"), true);
  assert.equal(isValidReminderTime("9:00"), false);
  assert.equal(isValidReminderTime("24:00"), false);
  assert.equal(isValidReminderTime("12:60"), false);
});

test("reminder timezone requires an IANA timezone", () => {
  assert.equal(isValidIanaTimezone("Africa/Johannesburg"), true);
  assert.equal(isValidIanaTimezone("America/New_York"), true);
  assert.equal(isValidIanaTimezone("GMT+2"), false);
  assert.equal(isValidIanaTimezone("not-a-timezone"), false);
});

test("a five-minute worker accepts the chosen minute and a short late window only", () => {
  assert.equal(isReminderDue("09:00", "09:00"), true);
  assert.equal(isReminderDue("09:00", "09:05"), true);
  assert.equal(isReminderDue("09:00", "09:09"), true);
  assert.equal(isReminderDue("09:00", "08:59"), false);
  assert.equal(isReminderDue("09:00", "09:10"), false);
});