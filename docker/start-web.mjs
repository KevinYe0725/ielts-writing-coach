if (!process.env.APP_URL) {
  if (process.env.RENDER_EXTERNAL_URL) {
    process.env.APP_URL = process.env.RENDER_EXTERNAL_URL;
  } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    process.env.APP_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
}

await import("../apps/web/server.js");
