import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { formatSubscriptionsList, success } from "./helpers";
import { subscriptions } from "./subscriptions";

export async function list(
  client: BotClient
): Promise<APIGatewayProxyResultV2> {
  const scope = client.scope as ChatActionScope;
  await subscriptions.initialising;
  const channelStats = await subscriptions.list(scope);
  const txt =
    channelStats.length === 0
      ? "You are not currently subscribed to any youtube channels"
      : formatSubscriptionsList(channelStats);
  const msg = (await client.createTextMessage(txt)).setFinalised(true);
  client
    .sendMessage(msg)
    .catch((err) =>
      console.log("Error sending list of channels to OC backend")
    );
  return success(msg);
}
