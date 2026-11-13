import test from "node:test";
import assert from "node:assert/strict";
import { readGuestQuery, guestToPerson } from "../lib/postprod-handoff.ts";

const png = "data:image/png;base64,AAECAwQ=";

test("guest query accepts embedded portraits and name aliases", () => {
  assert.deepEqual(
    readGuestQuery(new URLSearchParams(`gast=${png}&gastname=Thorsten`)),
    { image: png, name: "Thorsten" },
  );
  assert.deepEqual(readGuestQuery(new URLSearchParams(`guest=${png}`)), { image: png, name: undefined });
});

test("guest query rejects URL or text inputs", () => {
  assert.equal(readGuestQuery(new URLSearchParams("gast=data:text/html;base64,PHNjcmlwdD4=")), null);
  assert.equal(readGuestQuery(new URLSearchParams("gast=https://evil.invalid/image.png")), null);
});

test("guest portrait is applied as the only guest with query identity", () => {
  const person = guestToPerson({ image: png }, 217);
  assert.deepEqual(person, { id: "guest-query-217", name: "Gast", role: "guest", image: png });
});
