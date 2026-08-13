export default {
  external: ["graphile-worker", "nodemailer", "pg"],
  noExternal: [/^@iwc\//, /^drizzle-orm(?:\/.*)?$/],
  splitting: false,
};
