/** @type {import('next').NextConfig} */
const localApiOrigin = "http://localhost:3001";
const normalizeOrigin = (value) => {
  const normalized = value?.trim().replace(/\/+$/, "");
  if (!normalized) {
    return undefined;
  }

  if (/^https?:\/\//.test(normalized)) {
    return normalized;
  }

  return `http://${normalized}`;
};

const apiProxyTarget =
  normalizeOrigin(process.env.API_PROXY_TARGET) ||
  normalizeOrigin(process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "")) ||
  (process.env.NODE_ENV === "development" ? localApiOrigin : undefined);

const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ["@vulp/shared", "@vulp/api-client", "@vulp/ui-tokens", "@vulp/rbac"],
  async rewrites() {
    if (!apiProxyTarget) {
      return [];
    }

    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/api/v1/:path*`
      }
    ];
  }
};

export default nextConfig;
