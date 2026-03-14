const API_BASE_URL = (import.meta.env.VITE_API_URL|| "http://localhost:8000").replace(/\/+$/, "");

const normalizePath = (path: string): string => {
  if (!path) {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
};

const collapseRepeatedApiPrefix = (path: string): string => {
  let normalizedPath = path;

  while (normalizedPath.startsWith("/api/api/")) {
    normalizedPath = normalizedPath.replace(/^\/api/, "");
  }

  return normalizedPath;
};

export const buildApiUrl = (path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalizedPath = collapseRepeatedApiPrefix(normalizePath(path));

  if (API_BASE_URL === "/api") {
    // Some backend routers already include an /api prefix in FastAPI.
    // In Vite dev we still need the proxy prefix in front, so the browser
    // requests /api/api/... and the proxy rewrites only the first /api.
    return `${API_BASE_URL}${normalizedPath}`;
  }

  return `${API_BASE_URL}${normalizedPath}`;
};

export const buildAssetUrl = (path: string): string => {
  if (!path) {
    return path;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return buildApiUrl(path);
};

export const apiBaseUrl = API_BASE_URL;
