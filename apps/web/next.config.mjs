/** @type {import('next').NextConfig} */
const localApiOrigin = "http://localhost:3001";
const apiProxyTarget =
  process.env.API_PROXY_TARGET?.replace(/\/+$/, "") ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ||
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
