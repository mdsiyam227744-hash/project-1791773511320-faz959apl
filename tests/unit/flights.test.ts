import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFlightSearchParams } from "../../src/lib/geo.ts";
import { mapOffer, searchFlightOffers } from "../../src/lib/flights.ts";
import { haversineKm } from "../../src/lib/geo.ts";

// ---------------------------------------------------------------------------
// validateFlightSearchParams — the shared pre-flight validator
// ---------------------------------------------------------------------------

test("validator accepts a well-formed one-way search", () => {
  assert.equal(
    validateFlightSearchParams({ originIata: "DAC", destinationIata: "LHR", date: "2026-12-01" }),
    null,
  );
});

test("validator accepts a well-formed round trip", () => {
  assert.equal(
    validateFlightSearchParams({
      originIata: "DAC",
      destinationIata: "LHR",
      date: "2026-12-01",
      returnDate: "2026-12-15",
    }),
    null,
  );
});

test("validator rejects a same-airport route before any provider call", () => {
  assert.equal(
    validateFlightSearchParams({ originIata: "DAC", destinationIata: "DAC", date: "2026-12-01" }),
    "invalid_route",
  );
});

test("validator rejects malformed IATA codes and dates", () => {
  assert.equal(
    validateFlightSearchParams({ originIata: "DHAKA", destinationIata: "LHR", date: "2026-12-01" }),
    "invalid_params",
  );
  assert.equal(
    validateFlightSearchParams({ originIata: "DAC", destinationIata: "", date: "2026-12-01" }),
    "invalid_params",
  );
  assert.equal(
    validateFlightSearchParams({ originIata: "DAC", destinationIata: "LHR", date: "01/12/2026" }),
    "invalid_params",
  );
});

test("validator rejects a return date before departure", () => {
  assert.equal(
    validateFlightSearchParams({
      originIata: "DAC",
      destinationIata: "LHR",
      date: "2026-12-10",
      returnDate: "2026-12-01",
    }),
    "invalid_params",
  );
});

test("validator rejects a malformed return date", () => {
  assert.equal(
    validateFlightSearchParams({
      originIata: "DAC",
      destinationIata: "LHR",
      date: "2026-12-10",
      returnDate: "soon",
    }),
    "invalid_params",
  );
});

// ---------------------------------------------------------------------------
// searchFlightOffers — honest behavior with no credentials (never throws,
// never invents data; the environment has no AMADEUS_* variables by design)
// ---------------------------------------------------------------------------

test("unconfigured provider reports a structured, honest unavailable result", async () => {
  const result = await searchFlightOffers({
    originIata: "DAC",
    destinationIata: "LHR",
    date: "2026-12-01",
  });
  assert.equal(result.available, false);
  assert.equal(result.quotes.length, 0);
  // The specific reason depends on the runtime env: with no credentials it
  // must be not_configured; it must never be "available" with fake quotes.
  assert.ok(["flights_provider_not_configured", "invalid_params"].includes(result.reason ?? ""));
});

// ---------------------------------------------------------------------------
// mapOffer — provider payload mapping stays verbatim and defensive
// ---------------------------------------------------------------------------

test("mapOffer counts stops across itineraries", () => {
  const q = mapOffer({
    price: { grandTotal: "525.50", currency: "USD" },
    itineraries: [
      { segments: [{ carrierCode: "QR" }, { carrierCode: "QR" }] },
      { segments: [{ carrierCode: "QR" }, { carrierCode: "QR" }] },
    ],
  });
  assert.equal(q.airline, "QR");
  assert.equal(q.price, 525.5);
  assert.equal(q.currency, "USD");
  assert.equal(q.stops, 2);
});

test("mapOffer never throws on an empty payload", () => {
  const q = mapOffer({});
  assert.equal(q.price, 0);
  assert.equal(q.airline, "—");
});

// ---------------------------------------------------------------------------
// Distance stays a labelled approximation, computed from dataset coordinates
// ---------------------------------------------------------------------------

test("haversine distance is deterministic and symmetric for airport pairs", () => {
  const a = haversineKm(23.8433, 90.3978, 51.47, -0.4543); // DAC → LHR
  const b = haversineKm(51.47, -0.4543, 23.8433, 90.3978);
  assert.ok(a > 7800 && a < 8200, `unexpected DAC→LHR distance ${a}`);
  assert.ok(Math.abs(a - b) < 1e-9);
});
