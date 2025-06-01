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
      await subscriptions.initialising;
      console.log("installing: ", result.event.location);
      subscriptions.install(
        result.event.location,
        new InstallationRecord(
          result.apiGateway,
          result.event.grantedAutonomousPermissions,
          result.event.grantedCommandPermissions
        )
      );
    }
    if (result.event.kind === "bot_uninstalled_event") {
      await subscriptions.initialising;
      console.log("uninstalling: ", result.event.location);
      subscriptions.uninstall(result.event.location);
    }
  }
  return {
    statusCode: 200,
  };
};
