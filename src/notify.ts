import {
  InstallationRecord,
  parseBotNotification,
} from "@open-ic/openchat-botclient-ts";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { subscriptions } from "./subscriptions";

export const notify: APIGatewayProxyHandlerV2 = async (event) => {
  const result = parseBotNotification(event.body);
  if (result.kind === "bot_event_wrapper") {
    if (result.event.kind === "bot_installed_event") {
      console.log("installing: ", result.event.location);
      await subscriptions.install(
        result.event.location,
        new InstallationRecord(
          result.apiGateway,
          result.event.grantedAutonomousPermissions,
          result.event.grantedCommandPermissions
        )
      );
    }
    if (result.event.kind === "bot_uninstalled_event") {
      console.log("uninstalling: ", result.event.location);
      await subscriptions.uninstall(result.event.location);
    }
  } else if (result.kind === "bot_event_parse_failure") {
    console.error("Bot event parsing failed", result);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to parse bot event",
        result,
      }),
    };
  }
  return {
    statusCode: 200,
  };
};
