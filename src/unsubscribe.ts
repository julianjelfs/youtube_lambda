import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { unsubscribe as dbUnsubscribe, withPool } from "./db/database";
import { ephemeralResponse, formatChannelId } from "./helpers";

export async function unsubscribe(
  client: BotClient
): Promise<APIGatewayProxyResultV2> {
  const channel = client.stringArg("channel_id");
  const scope = client.scope as ChatActionScope;

  if (channel) {
    await withPool(async () => {
      await dbUnsubscribe(channel, scope);
    });

    return ephemeralResponse(
      client,
      `You are now unsubscribed from YouTube channel: ${formatChannelId(
        channel
      )}`
    );
  } else {
    return ephemeralResponse(
      client,
      "You must provide a YouTube channel to unsubscribe from"
    );
  }
}
