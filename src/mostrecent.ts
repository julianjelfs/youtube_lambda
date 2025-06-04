import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { ephemeralResponse } from "./helpers";
import { subscriptions } from "./subscriptions";

export async function mostrecent(
  client: BotClient
): Promise<APIGatewayProxyResultV2> {
  await subscriptions.initialising;
  const channelId = client.stringArg("channel_id");
  const scope = client.scope as ChatActionScope;
  if (channelId === undefined) {
    return ephemeralResponse(
      client,
      "You must supply a youtube channel ID to check"
    );
  }
  const msg = await subscriptions.mostRecent(scope, channelId);
  const txt =
    msg === undefined ? "I couldn't find any content for this channel" : msg;

  return ephemeralResponse(client, txt);
}
