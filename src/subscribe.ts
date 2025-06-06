import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { ephemeralResponse, formatChannelId } from "./helpers";
import { subscriptions } from "./subscriptions";

export async function subscribe(
  client: BotClient
): Promise<APIGatewayProxyResultV2> {
  const channel = client.stringArg("channel_id");
  const scope = client.scope as ChatActionScope;

  if (channel) {
    if (!(await subscriptions.subscribe(channel, scope))) {
      return ephemeralResponse(
        client,
        "This bot does not seem to be installed in this scope at the moment"
      );
    }

    return ephemeralResponse(
      client,
      `You are now subscribed to YouTube channel: ${formatChannelId(channel)}`
    );
  } else {
    return ephemeralResponse(
      client,
      "You must provide a YouTube channel to subscribe to"
    );
  }
}
