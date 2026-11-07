export type PlaceholderLocation = {
  label: string;
  line: string;
};

const defaultLabel = "Home";
const defaultLine = "Add your address";

export function placeholderLocation(): PlaceholderLocation {
  const label = process.env.EXPO_PUBLIC_PLACEHOLDER_ADDRESS_LABEL?.trim();
  const line = process.env.EXPO_PUBLIC_PLACEHOLDER_ADDRESS_LINE?.trim();
  return {
    label: label && label.length > 0 ? label : defaultLabel,
    line: line && line.length > 0 ? line : defaultLine,
  };
}

export function locationSubtitle(location: PlaceholderLocation, eta?: string): string {
  const place = `${location.label}, ${location.line}`;
  const trimmed = eta?.trim();
  return trimmed ? `${trimmed} · ${place}` : place;
}
