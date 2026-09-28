"use client";

import { useState, type ClipboardEvent } from "react";
import { ExternalLink, Loader2, LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";

/** Kept as raw strings — the server coerces and validates, so a typo surfaces as a real error instead of a silent NaN→0. */
export type SiteCoordinates = { latitude: string; longitude: string; radius: string };

export const EMPTY_SITE_COORDINATES: SiteCoordinates = { latitude: "", longitude: "", radius: "100" };

const COORDINATE_PAIR = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/**
 * The geofence a self-service clock-in is judged against (ADR-026). Two
 * ways to fill it without hand-typing decimals: standing at the site and
 * using the device's GPS, or pasting "lat, lng" straight from Google Maps
 * (right-click a spot → click the coordinates to copy) into either box.
 */
export function SiteCoordinatesFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: SiteCoordinates;
  onChange: (next: SiteCoordinates) => void;
}) {
  const [isLocating, setIsLocating] = useState(false);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const match = event.clipboardData.getData("text").match(COORDINATE_PAIR);
    if (!match) return;
    event.preventDefault();
    onChange({ ...value, latitude: match[1], longitude: match[2] });
  }

  function fillFromCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setLocateMessage("This browser can't read your location.");
      return;
    }
    setIsLocating(true);
    setLocateMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          ...value,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        });
        setLocateMessage(`Located to within ±${Math.round(position.coords.accuracy)} m.`);
        setIsLocating(false);
      },
      (error) => {
        setLocateMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location access was blocked. Allow it for this site in your browser settings."
            : "Couldn't get a location fix. Try again, or paste coordinates from Google Maps.",
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  const hasPair = value.latitude.trim() !== "" && value.longitude.trim() !== "";

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3">
      <legend className="sr-only">Clock-in site</legend>
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Clock-in site</p>
          <p className="text-xs text-muted-foreground">
            Employees can only clock in within this radius. Leave the coordinates blank if this isn&apos;t a clock-in site.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Latitude" htmlFor={`${idPrefix}-latitude`}>
          <Input
            id={`${idPrefix}-latitude`}
            inputMode="decimal"
            value={value.latitude}
            onChange={(event) => onChange({ ...value, latitude: event.target.value })}
            onPaste={handlePaste}
            placeholder="e.g. 14.554729"
          />
        </FormField>
        <FormField label="Longitude" htmlFor={`${idPrefix}-longitude`}>
          <Input
            id={`${idPrefix}-longitude`}
            inputMode="decimal"
            value={value.longitude}
            onChange={(event) => onChange({ ...value, longitude: event.target.value })}
            onPaste={handlePaste}
            placeholder="e.g. 121.024445"
          />
        </FormField>
      </div>

      <FormField label="Allowed radius (meters)" htmlFor={`${idPrefix}-radius`}>
        <Input
          id={`${idPrefix}-radius`}
          inputMode="numeric"
          value={value.radius}
          onChange={(event) => onChange({ ...value, radius: event.target.value })}
          placeholder="e.g. 100"
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={fillFromCurrentLocation} disabled={isLocating} data-testid={`${idPrefix}-use-current-location`}>
          {isLocating ? <Loader2 className="size-3.5 animate-spin" /> : <LocateFixed className="size-3.5" />}
          {isLocating ? "Locating…" : "Use my current location"}
        </Button>
        {hasPair && (
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(`${value.latitude.trim()},${value.longitude.trim()}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Check on Google Maps
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>
      {locateMessage && <p className="text-xs text-muted-foreground">{locateMessage}</p>}
      <p className="text-xs text-muted-foreground">Tip: paste &ldquo;14.5547, 121.0244&rdquo; from Google Maps into either box to fill both.</p>
    </fieldset>
  );
}
