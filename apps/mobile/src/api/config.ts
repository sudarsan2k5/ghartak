export type ApiPlatform = "android" | "ios" | "web";

const androidEmulatorHost = "http://10.0.2.2:3000";
const localHost = "http://127.0.0.1:3000";

export function apiBaseUrl(input: {
  configured: string | undefined;
  platform: ApiPlatform;
  appEnv: string;
}): string {
  const configured = input.configured?.trim();
  if (configured) {
    return assertHttpOrigin(configured);
  }
  if (input.appEnv === "production") {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is required when EXPO_PUBLIC_APP_ENV is production");
  }
  return input.platform === "android" ? androidEmulatorHost : localHost;
}

export function imageBaseUrl(configured: string | undefined): string | null {
  const value = configured?.trim();
  if (!value) {
    return null;
  }
  return assertHttpOrigin(value);
}

function assertHttpOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("API and image base URLs must be absolute http(s) URLs");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API and image base URLs must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("API and image base URLs must not include credentials");
  }
  return url.origin;
}
