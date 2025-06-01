import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { formatSubscriptionsList, success } from "./helpers";
import { subscriptions } from "./subscriptions";

export async function list(
  client: BotClient
): Promise<APIGatewayProxyResultV2> {
  await subscriptions.initialising;
  const scope = client.scope as ChatActionScope;
  const subs = subscriptions.list(scope);
  const txt =
    subs.length === 0
      ? "You are not currently subscribed to any youtube channels"
      : formatSubscriptionsList(subs);
  const msg = (await client.createTextMessage(txt)).setFinalised(true);
  client
    .sendMessage(msg)
    .catch((err) =>
      console.log("Error sending list of channels to OC backend")
    );
  return success(msg);
}
