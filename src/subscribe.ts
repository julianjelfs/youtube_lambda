import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { subscribe as dbSubscribe, withPool } from "./db/database";
import { ephemeralResponse, formatChannelId } from "./helpers";

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

    const result = await withPool(() => dbSubscribe(channel, scope));
    if (result.kind === "not_installed") {
      return ephemeralResponse(
        client,
        "This bot does not seem to be installed in this scope at the moment"
      );
    }

    if (result.kind === "channel_not_found") {
      return ephemeralResponse(
        client,
        "I can't seem to find that channel - double check the id and try again"
      );
    }

    return ephemeralResponse(
      client,
      `You are now subscribed to YouTube channel: ${formatChannelId(
        channel,
        result.channel.name ?? result.channel.youtubeChannelId
      )}`
    );
  } else {
    return ephemeralResponse(
      client,
      "You must provide a YouTube channel to subscribe to"
    );
  }
}
