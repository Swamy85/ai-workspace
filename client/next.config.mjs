/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workspace is a fully client-side app, so export static HTML instead of
  // running a Next.js server. Netlify serves `out/` and the Express API runs as
  // a Netlify Function behind /api.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
