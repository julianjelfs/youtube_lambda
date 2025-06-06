import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { ephemeralResponse } from "./helpers";
import { subscriptions } from "./subscriptions";

export async function refreshCommand(
  client: BotClient
): Promise<APIGatewayProxyResultV2> {
  await subscriptions.refreshScope(client.scope as ChatActionScope);
  return ephemeralResponse(
    client,
    "All subscriptions for this scope refreshed. If there are any new videos they will be posted shortly."
  );
}
