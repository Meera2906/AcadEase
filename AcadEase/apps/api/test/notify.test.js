import test from "node:test";
import assert from "node:assert/strict";
import { registerNotificationStream, unregisterNotificationStream, emitNotificationToUser } from "../src/utils/notify.js";

test("emits a live notification event to the matching user stream", () => {
  const messages = [];
  const stream = {
    write: (data) => messages.push(data),
    on: (event, handler) => {
      if (event === "close") stream.onClose = handler;
    },
    end: () => {},
  };

  registerNotificationStream("STU-1", stream);
  emitNotificationToUser("STU-1", { _id: "n-1", title: "Marked absent", message: "Test" });
  unregisterNotificationStream("STU-1", stream);

  assert.equal(messages.length > 0, true);
  assert.match(messages[0], /Marked absent/);
});
