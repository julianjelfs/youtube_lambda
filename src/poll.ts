import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  getBatchOfChannels,
  getSubscriptionsForChannelIds,
  pruneChannels,
  Tx,
  updateChannelsLastUpdate,
  withPool,
  withTransaction,
} from "./db/database";
import { sendNewContentForSubscription } from "./send";
import { getVideosSince } from "./youtube";

export const poll: APIGatewayProxyHandlerV2 = async (_) => {
  await withPool(async () => {
    try {
      await withTransaction((tx) => processQueue(tx));
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

async function processQueue(tx: Tx) {
  await pruneChannels(tx);
  const channels = await getBatchOfChannels(tx);
  const newContent = await getNewContentForBatch(channels);
  const channelIdsWithUpdates = [...newContent.keys()];
  await updateChannelsLastUpdate(tx, channelIdsWithUpdates, BigInt(Date.now()));

  const subsToUpdate = await getSubscriptionsForChannelIds(
    tx,
    channelIdsWithUpdates
  );

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
  await sendPromises;
}

async function getNewContentForBatch(
  channels: { channelId: string; lastUpdated: bigint }[]
): Promise<Map<string, string>> {
  console.log(
    "Checking for new content for the following channels: ",
    channels
  );
  const results = new Map<string, string>();
  await Promise.all(
    channels.map((channel) =>
      getVideosSince(channel.channelId, channel.lastUpdated).then((msg) => {
        if (msg !== undefined) {
          results.set(channel.channelId, msg);
        }
      })
    )
  );
  return results;
}
