import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { ephemeralResponse, formatChannelId } from "./helpers";
import { subscriptions } from "./subscriptions";

export async function unsubscribe(
  client: BotClient
): Promise<APIGatewayProxyResultV2> {
  const channel = client.stringArg("channel_id");
  const scope = client.scope as ChatActionScope;

  if (channel) {
    if (!(await subscriptions.unsubscribe(channel, scope))) {
      return ephemeralResponse(
        client,
        "It doesn't look like we have a subscription for that channel :shrugs:"
      );
    }

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
