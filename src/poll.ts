import { ChatActionScope, Permissions } from "@open-ic/openchat-botclient-ts";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  getBatchOfChannels,
  getSubscriptionsForChannelIds,
  incrementChannelsFailureCount,
  pruneChannels,
  updateChannelsLastUpdate,
  withPool,
  withTransaction,
} from "./db/database";
import { sendNewContentForSubscription } from "./send";
import { FeedData } from "./types";
import { getVideosSince } from "./youtube";

export const poll: APIGatewayProxyHandlerV2 = async (_) => {
  await withPool(async () => {
    try {
      await processQueue();
    } catch (err) {
      console.error("Error processing subscriptions", err);
    }
  });
  console.log("Refreshed all subscriptions");
  return {
    statusCode: 200,
    message: "Refreshed all subscriptions",
  };
};

async function processQueue() {
  let newContent: Map<string, FeedData<string | undefined>> = new Map();
  let subsToUpdate: {
    apiGateway: string;
    autonomousPermissions: Permissions;
    scope: ChatActionScope;
    channelId: string;
  }[] = [];

  await withTransaction(async (tx) => {
    // await unsubscribeFailed(tx);
    await pruneChannels(tx);
    newContent = await getBatchOfChannels(tx).then(getNewContentForBatch);
    const [channelIdsWithUpdates, channelIdsInError] = [
      ...newContent.entries(),
    ].reduce(
      ([updated, errors], [key, val]) => {
        if (val.kind === "feed_data" && val.data !== undefined) {
          updated.push(key);
        }
        if (val.kind === "feed_error") {
          errors.push(key);
        }
        return [updated, errors];
      },
      [[], []] as [string[], string[]]
    );
    await Promise.all([
      updateChannelsLastUpdate(tx, channelIdsWithUpdates, Date.now()),
      incrementChannelsFailureCount(tx, channelIdsInError),
    ]);
    subsToUpdate = await getSubscriptionsForChannelIds(
      tx,
      channelIdsWithUpdates
    );
  });

  const sendPromises: Promise<void>[] = [];
  for (const {
    apiGateway,
    autonomousPermissions,
    scope,
    channelId,
  } of subsToUpdate) {
    const feed = newContent.get(channelId);
    if (
      feed?.kind === "feed_error" ||
      feed?.data === undefined ||
      !autonomousPermissions.hasMessagePermission("Text")
    ) {
      continue;
    }
    sendPromises.push(
      sendNewContentForSubscription(
        apiGateway,
        autonomousPermissions,
        scope,
        channelId,
        feed.data
      )
    );
  }
  await Promise.all(sendPromises);
}

async function getNewContentForBatch(
  channels: { channelId: string; lastUpdated: number | null }[]
): Promise<Map<string, FeedData<string | undefined>>> {
  console.log(
    "Checking for new content for the following channels: ",
    channels
  );
  const results = new Map<string, FeedData<string | undefined>>();
  await Promise.all(
    channels.map((channel) =>
      getVideosSince(channel.channelId, channel.lastUpdated ?? 0).then(
        (feed) => {
          if (feed !== undefined) {
            results.set(channel.channelId, feed);
          }
        }
      )
    )
  );
  return results;
}
