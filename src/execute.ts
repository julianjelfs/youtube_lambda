import { commandNotFound } from "@open-ic/openchat-botclient-ts";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { badRequest, withBotClient } from "./helpers";
import { list } from "./list";
import { refreshCommand } from "./refresh";
import { subscribe } from "./subscribe";
import { unsubscribe } from "./unsubscribe";

export const command: APIGatewayProxyHandlerV2 = async (event) => {
  return withBotClient(event, async (client) => {
    switch (client.commandName) {
      case "refresh":
        return refreshCommand(client);
      case "list":
        return list(client);
      case "subscribe":
        return subscribe(client);
      case "unsubscribe":
        return unsubscribe(client);
      default:
        return badRequest(commandNotFound());
    }
  });
};
