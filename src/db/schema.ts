import {
  bigint,
  foreignKey,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

export const youtubeChannels = pgTable("YOUTUBE_CHANNELS", {
  name: text("name"),
  youtubeChannel: text("youtube_channel").primaryKey().notNull(),
  lastUpdated: bigint("last_updated", { mode: "number" }),
  failureCount: integer("failure_count").default(0).notNull(),
});

export const installations = pgTable("INSTALLATIONS", {
  location: text().primaryKey().notNull(),
  apiGateway: text("api_gateway").notNull(),
  commandPermissions: json("command_permissions").notNull(),
  autonomousPermissions: json("autonomous_permissions").notNull(),
});

export const subscriptions = pgTable(
  "SUBSCRIPTIONS",
  {
    location: text().notNull(),
    scope: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.location],
      foreignColumns: [installations.location],
      name: "installation_location",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.location, table.scope],
      name: "location_scope",
    }),
  ]
);

export const subscriptionChannels = pgTable(
  "SUBSCRIPTION_CHANNELS",
  {
    location: text().notNull(),
    scope: text().notNull(),
    channelId: text("channel_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.location, table.scope],
      foreignColumns: [subscriptions.location, subscriptions.scope],
      name: "fk",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.location, table.scope, table.channelId],
      name: "pk",
    }),
  ]
);
