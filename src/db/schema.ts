import {
  bigint,
  foreignKey,
  json,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

export const installations = pgTable("INSTALLATIONS", {
  location: text("location").primaryKey(),
  api_gateway: text("api_gateway").notNull(),
  commandPermissions: json("command_permissions").notNull(),
  autonomousPermissions: json("autonomous_permissions").notNull(),
});

export const subscriptions = pgTable(
  "SUBSCRIPTIONS",
  {
    location: text("location")
      .notNull()
      .references(() => installations.location),
    scope: text("scope").notNull(),
  },
  (table) => [
    primaryKey({ name: "pk", columns: [table.location, table.scope] }),
  ]
);

export const subscriptionChannels = pgTable(
  "SUBSCRIPTION_CHANNELS",
  {
    location: text("location").notNull(),
    scope: text("scope").notNull(),
    channel_id: text("channel_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "pk",
      columns: [table.location, table.scope, table.channel_id],
    }),
    foreignKey({
      columns: [table.location, table.scope],
      foreignColumns: [subscriptions.location, subscriptions.scope],
      name: "fk",
    }),
    foreignKey({
      columns: [table.channel_id],
      foreignColumns: [youtubeChannels.youtube_channel],
      name: "fk2",
    }),
  ]
);

export const youtubeChannels = pgTable("YOUTUBE_CHANNELS", {
  youtube_channel: text("youtube_channel").primaryKey(),
  last_updated: bigint("last_updated", { mode: "bigint" }).notNull(),
});
