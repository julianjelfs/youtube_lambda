import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { subscribedChannelIds, withPool } from "./db/database";
import { ephemeralResponse, formatSubscriptionsList } from "./helpers";

export async function list(
  client: BotClient
): Promise<APIGatewayProxyResultV2> {
  const scope = client.scope as ChatActionScope;
  const channelStats = await withPool(() => subscribedChannelIds(scope));
  const txt =
    channelStats.length === 0
      ? "You are not currently subscribed to any youtube channels"
      : formatSubscriptionsList(channelStats);

  return ephemeralResponse(client, txt);
}
