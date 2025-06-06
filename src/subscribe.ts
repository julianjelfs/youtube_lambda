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
    const valid = /^UC[a-zA-Z0-9_-]{22}$/.test(channel);
    if (!valid) {
      return ephemeralResponse(
        client,
        `The supplied parameter "${channel}" does not look like a valid Youtube channel ID. It should begin with "UC" and be followed by 22 characters. For information on how to find the channel ID for a channel please [check the readme](https://github.com/julianjelfs/youtube_lambda/blob/main/README.md).`
      );
    }
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
