import { describe, it, expect } from "vitest";
import { distanceInMeters, evaluateGeofence, formatDistance } from "@/domains/attendance/geofence";

// Reference points in Metro Manila. Rizal Park → Manila City Hall works out
// to ~830 m by hand (0.007° lat ≈ 778 m, 0.0027° lon at 14.6°N ≈ 291 m); the
// 0.0009° latitude step is ~100 m anywhere on Earth (1° latitude ≈ 111.2 km).
const RIZAL_PARK = { latitude: 14.5826, longitude: 120.9787 };
const MANILA_CITY_HALL = { latitude: 14.5896, longitude: 120.9814 };

describe("distanceInMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceInMeters(RIZAL_PARK, RIZAL_PARK)).toBe(0);
  });

  it("matches a known ~100 m latitude step", () => {
    const north = { latitude: RIZAL_PARK.latitude + 0.0009, longitude: RIZAL_PARK.longitude };
    expect(distanceInMeters(RIZAL_PARK, north)).toBeCloseTo(100, -1);
  });

  it("matches a known real-world distance within a few meters", () => {
    const meters = distanceInMeters(RIZAL_PARK, MANILA_CITY_HALL);
    expect(meters).toBeGreaterThan(820);
    expect(meters).toBeLessThan(860);
  });

  it("is symmetric", () => {
    expect(distanceInMeters(RIZAL_PARK, MANILA_CITY_HALL)).toBeCloseTo(distanceInMeters(MANILA_CITY_HALL, RIZAL_PARK), 6);
  });
});

describe("evaluateGeofence", () => {
  it("is within when the distance is inside the radius", () => {
    const result = evaluateGeofence(RIZAL_PARK, { ...RIZAL_PARK, radiusMeters: 100 });
    expect(result).toEqual({ withinRadius: true, distanceMeters: 0, radiusMeters: 100 });
  });

  it("treats exactly-on-the-boundary as within", () => {
    const north = { latitude: RIZAL_PARK.latitude + 0.0009, longitude: RIZAL_PARK.longitude };
    const exact = distanceInMeters(RIZAL_PARK, north);
    expect(evaluateGeofence(north, { ...RIZAL_PARK, radiusMeters: exact }).withinRadius).toBe(true);
  });

  it("is outside when the distance exceeds the radius, and rounds the distance to whole meters", () => {
    const result = evaluateGeofence(MANILA_CITY_HALL, { ...RIZAL_PARK, radiusMeters: 200 });
    expect(result.withinRadius).toBe(false);
    expect(Number.isInteger(result.distanceMeters)).toBe(true);
  });
});

describe("formatDistance", () => {
  it("uses meters below 1 km", () => {
    expect(formatDistance(42)).toBe("42 m");
  });

  it("uses kilometers with one decimal from 1 km up", () => {
    expect(formatDistance(1234)).toBe("1.2 km");
  });
});
