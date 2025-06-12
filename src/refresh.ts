import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import {
  getInstallation,
  subscribedChannelIds,
  updateYoutubeChannel,
  withPool,
} from "./db/database";
import { ephemeralResponse } from "./helpers";
import { sendNewContentForSubscription } from "./send";
import { getVideosSince } from "./youtube";

export async function refreshCommand(
  client: BotClient
): Promise<APIGatewayProxyResultV2> {
  await withPool(async () => {
    const scope = client.scope as ChatActionScope;
    const installation = await getInstallation(scope);
    if (
      installation === undefined ||
      !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
    ) {
      return;
    }

    const channels = await subscribedChannelIds(scope);

    if (channels) {
      try {
        for (const { youtubeChannelId, lastUpdated } of channels) {
          const msgTxt = await getVideosSince(youtubeChannelId, lastUpdated);
          if (msgTxt === undefined) continue;

          await updateYoutubeChannel(youtubeChannelId, BigInt(Date.now()));

          await sendNewContentForSubscription(
            installation.apiGateway,
            installation.grantedAutonomousPermissions,
            scope,
            youtubeChannelId,
            msgTxt
          );
        }
      } catch (err) {
        console.error("Error processing subscriptions", err);
      }
    }
  });

  return ephemeralResponse(
    client,
    "All subscriptions for this scope refreshed. If there are any new videos they will be posted shortly."
  );
}
