import {
    ActionScope,
    ChatActionScope,
    chatIdentifierToInstallationLocation,
    InstallationLocation,
    InstallationRecord,
    Permissions,
} from "@open-ic/openchat-botclient-ts";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ChannelStats, SubscribeResult } from "../types";
import { getFeedName } from "../youtube";
import * as schema from "./schema";
import { installations } from "./schema";

const pool = new Pool({
    connectionString: process.env.PG_CONNECTION,
    ssl: { rejectUnauthorized: false }, // optional, depends on config
});
const db = drizzle({ client: pool, schema });

export type Tx = Parameters<typeof db.transaction>[0] extends (
    tx: infer T,
) => any
    ? T
    : never;

type RawPermissions = {
    chat: number;
    community: number;
    message: number;
};

export async function getInstallation(
    tx: Tx,
    scope: ChatActionScope,
): Promise<InstallationRecord | undefined> {
    const location = chatIdentifierToInstallationLocation(scope.chat);
    const locationKey = keyify(location);

    // check that we are installed in this location
    const install = await tx.query.installations.findFirst({
        where: (i, { eq }) => eq(i.location, locationKey),
    });

    if (install === undefined) return undefined;

    return new InstallationRecord(
        install.apiGateway,
        new Permissions(install.commandPermissions as RawPermissions),
        new Permissions(install.autonomousPermissions as RawPermissions),
        0n,
    );
}

export async function saveInstallation(
    location: InstallationLocation,
    record: InstallationRecord,
) {
    const locationKey = keyify(location);
    await db
        .insert(schema.installations)
        .values({
            location: locationKey,
            apiGateway: record.apiGateway,
            autonomousPermissions:
                record.grantedAutonomousPermissions.rawPermissions,
            commandPermissions: record.grantedCommandPermissions.rawPermissions,
        })
        .onConflictDoUpdate({
            target: schema.installations.location,
            set: {
                autonomousPermissions:
                    record.grantedAutonomousPermissions.rawPermissions,
                commandPermissions:
                    record.grantedCommandPermissions.rawPermissions,
            },
        });
}

export async function uninstall(location: InstallationLocation) {
    const key = keyify(location);
    await db.delete(installations).where(eq(installations.location, key));
}

export async function subscribe(
    channelId: string,
    scope: ChatActionScope,
): Promise<SubscribeResult> {
    const location = chatIdentifierToInstallationLocation(scope.chat);
    const locationKey = keyify(location);
    const scopeKey = keyify(scope);

    // check that we are installed in this location
    const install = await db.query.installations.findFirst({
        where: (i, { eq }) => eq(i.location, locationKey),
    });

    if (install === undefined) {
        return { kind: "not_installed" };
    }

    const channel = await getFeedName(channelId);
    const now = new Date().getTime();
    if (channel.kind === "feed_error") {
        return { kind: "channel_not_found" };
    }
    const channelName = channel.data;

    await db.transaction(async (tx) => {
        // insert subscription
        await tx
            .insert(schema.subscriptions)
            .values({ location: locationKey, scope: scopeKey })
            .onConflictDoNothing();

        // insert youtube channel
        await tx
            .insert(schema.youtubeChannels)
            .values({
                youtubeChannel: channelId,
                lastUpdated: now,
                name: channelName,
            })
            .onConflictDoUpdate({
                target: schema.youtubeChannels.youtubeChannel,
                set: { name: channelName },
            });

        // insert the link
        await tx
            .insert(schema.subscriptionChannels)
            .values({
                location: locationKey,
                scope: scopeKey,
                channelId: channelId,
            })
            .onConflictDoNothing();
    });

    return {
        kind: "success",
        channel: {
            youtubeChannelId: channelId,
            lastUpdated: now,
            name: channelName,
        },
    };
}

export async function unsubscribeAll(scope: ChatActionScope) {
    const location = chatIdentifierToInstallationLocation(scope.chat);
    const locationKey = keyify(location);
    const scopeKey = keyify(scope);
    await db
        .delete(schema.subscriptionChannels)
        .where(
            and(
                eq(schema.subscriptionChannels.location, locationKey),
                eq(schema.subscriptionChannels.scope, scopeKey),
            ),
        );
}

export async function unsubscribeFailed(tx: Tx) {
    await tx
        .delete(schema.subscriptionChannels)
        .where(
            inArray(
                schema.subscriptionChannels.channelId,
                sql`(SELECT ${schema.youtubeChannels.youtubeChannel} FROM ${schema.youtubeChannels} WHERE ${schema.youtubeChannels.failureCount} > 5)`,
            ),
        );
}

export async function unsubscribe(
    youtubeChannelId: string,
    scope: ChatActionScope,
) {
    const location = chatIdentifierToInstallationLocation(scope.chat);
    const locationKey = keyify(location);
    const scopeKey = keyify(scope);
    await db
        .delete(schema.subscriptionChannels)
        .where(
            and(
                eq(schema.subscriptionChannels.location, locationKey),
                eq(schema.subscriptionChannels.scope, scopeKey),
                eq(schema.subscriptionChannels.channelId, youtubeChannelId),
            ),
        );
}

export async function hasSubscription(
    scope: ChatActionScope,
    channeId: string,
): Promise<boolean> {
    const location = chatIdentifierToInstallationLocation(scope.chat);
    const locationKey = keyify(location);
    const scopeKey = keyify(scope);
    const sub = await db.query.subscriptionChannels.findFirst({
        where: (i, { eq, and }) =>
            and(
                eq(i.location, locationKey),
                eq(i.scope, scopeKey),
                eq(i.channelId, channeId),
            ),
    });
    return sub !== undefined;
}

export async function withTransaction<T>(
    fn: (tx: Tx) => Promise<T>,
): Promise<T> {
    return db.transaction(async (tx) => {
        return fn(tx);
    });
}

export async function withPool<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } finally {
        if (process.env.MODE === "development") {
            await pool.end();
        }
    }
}

export async function updateYoutubeChannel(
    tx: Tx,
    channelId: string,
    lastUpdated: number,
) {
    await tx
        .update(schema.youtubeChannels)
        .set({
            lastUpdated: lastUpdated,
            failureCount: 0,
            lastAttempt: lastUpdated,
        })
        .where(eq(schema.youtubeChannels.youtubeChannel, channelId));
}

export async function subscribedChannelIds(
    tx: Tx,
    scope: ChatActionScope,
): Promise<ChannelStats[]> {
    const scopeKey = keyify(scope);
    const rows = await tx
        .select({
            channelId: schema.subscriptionChannels.channelId,
            lastUpdated: schema.youtubeChannels.lastUpdated,
            name: schema.youtubeChannels.name,
        })
        .from(schema.subscriptionChannels)
        .innerJoin(
            schema.youtubeChannels,
            eq(
                schema.subscriptionChannels.channelId,
                schema.youtubeChannels.youtubeChannel,
            ),
        )
        .where(eq(schema.subscriptionChannels.scope, scopeKey));
    return rows.map((r) => ({
        youtubeChannelId: r.channelId,
        lastUpdated: r.lastUpdated ?? 0,
        name: r.name ?? undefined,
    }));
}

export async function pruneChannels(tx: Tx) {
    await tx.execute(sql`
        DELETE FROM "YOUTUBE_CHANNELS"
        WHERE NOT EXISTS (
          SELECT 1 FROM "SUBSCRIPTION_CHANNELS"
          WHERE "SUBSCRIPTION_CHANNELS"."channel_id" = "YOUTUBE_CHANNELS"."youtube_channel"
        )
      `);
}

export async function updateChannelsLastUpdate(
    tx: Tx,
    channelIds: string[],
    lastUpdated: number,
) {
    return tx
        .update(schema.youtubeChannels)
        .set({
            lastUpdated: lastUpdated,
            failureCount: 0,
            lastAttempt: lastUpdated,
        })
        .where(inArray(schema.youtubeChannels.youtubeChannel, channelIds));
}

export async function incrementChannelsFailureCount(
    tx: Tx,
    channelIds: string[],
    attemptedAt: number,
) {
    return tx
        .update(schema.youtubeChannels)
        .set({
            failureCount: sql`${schema.youtubeChannels.failureCount} + 1`,
            lastAttempt: attemptedAt,
        })
        .where(inArray(schema.youtubeChannels.youtubeChannel, channelIds));
}

// A failing channel waits POLL_INTERVAL_MS * 2^failures (capped) before it
// is retried, so it never becomes permanently unreachable and a success
// always gets the chance to reset its failure count.
const POLL_INTERVAL_MS = 30 * 60 * 1000;
const MAX_BACKOFF_EXPONENT = 6;

export async function getBatchOfChannels(tx: Tx, now: number) {
    const c = schema.youtubeChannels;
    return tx
        .select({
            channelId: c.youtubeChannel,
            lastUpdated: c.lastUpdated,
        })
        .from(c)
        .where(
            sql`${c.lastAttempt} IS NULL OR ${c.lastAttempt} + ${POLL_INTERVAL_MS}::bigint * power(2, least(${c.failureCount}, ${MAX_BACKOFF_EXPONENT}))::bigint <= ${now}`,
        )
        .orderBy(sql`${c.lastAttempt} ASC NULLS FIRST`, asc(c.lastUpdated))
        .limit(50);
}

export async function getSubscriptionsForChannelIds(
    tx: Tx,
    channelIds: string[],
) {
    const rows = await tx
        .select({
            apiGateway: schema.installations.apiGateway,
            autonomousPermissions: schema.installations.autonomousPermissions,
            scope: schema.subscriptionChannels.scope,
            channelId: schema.subscriptionChannels.channelId,
        })
        .from(schema.installations)
        .innerJoin(
            schema.subscriptionChannels,
            eq(
                schema.installations.location,
                schema.subscriptionChannels.location,
            ),
        )
        .where(inArray(schema.subscriptionChannels.channelId, channelIds));

    return rows.map((r) => ({
        apiGateway: r.apiGateway,
        autonomousPermissions: new Permissions(
            r.autonomousPermissions as RawPermissions,
        ),
        scope: ActionScope.fromString(unkeyify(r.scope)) as ChatActionScope,
        channelId: r.channelId,
    }));
}

function keyify(thing: unknown): string {
    return Buffer.from(JSON.stringify(thing)).toString("base64url");
}

export function unkeyify(key: string): string {
    return Buffer.from(key, "base64url").toString("utf8");
}
