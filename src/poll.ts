import { ChatActionScope, Permissions } from "@open-ic/openchat-botclient-ts";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  getBatchOfChannels,
  getSubscriptionsForChannelIds,
  pruneChannels,
  updateChannelsLastUpdate,
  withPool,
  withTransaction,
} from "./db/database";
import { sendNewContentForSubscription } from "./send";
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
  let newContent: Map<string, string> = new Map();
  let subsToUpdate: {
    apiGateway: string;
    autonomousPermissions: Permissions;
    scope: ChatActionScope;
    channelId: string;
  }[] = [];

  await withTransaction(async (tx) => {
    await pruneChannels(tx);
    const channels = await getBatchOfChannels(tx);
    newContent = await getNewContentForBatch(channels);
    const channelIdsWithUpdates = [...newContent.keys()];
    await updateChannelsLastUpdate(tx, channelIdsWithUpdates, Date.now());
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
    const msgText = newContent.get(channelId);
    if (
      !autonomousPermissions.hasMessagePermission("Text") ||
      msgText === undefined
    ) {
      continue;
    }
    sendPromises.push(
      sendNewContentForSubscription(
        apiGateway,
        autonomousPermissions,
        scope,
        channelId,
        msgText
      )
    );
  }
  await Promise.all(sendPromises);
}

async function getNewContentForBatch(
  channels: { channelId: string; lastUpdated: number | null }[]
): Promise<Map<string, string>> {
  console.log(
    "Checking for new content for the following channels: ",
    channels
  );
  const results = new Map<string, string>();
  await Promise.all(
    channels.map((channel) =>
      getVideosSince(channel.channelId, channel.lastUpdated ?? 0).then(
        (msg) => {
          if (msg !== undefined) {
            results.set(channel.channelId, msg);
          }
        }
      )
    )
  );
  return results;
}
