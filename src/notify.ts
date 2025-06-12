import {
  InstallationRecord,
  parseBotNotification,
} from "@open-ic/openchat-botclient-ts";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { saveInstallation, uninstall, withPool } from "./db/database";

export const notify: APIGatewayProxyHandlerV2 = async (event) => {
  const result = parseBotNotification(event.body);
  if (result.kind === "bot_event_wrapper") {
    if (result.event.kind === "bot_installed_event") {
      console.log("installing: ", result.event.location);
      const location = result.event.location;
      const record = new InstallationRecord(
        result.apiGateway,
        result.event.grantedAutonomousPermissions,
        result.event.grantedCommandPermissions
      );

      await withPool(async () => {
        await saveInstallation(location, record);
      });
    }
    if (result.event.kind === "bot_uninstalled_event") {
      console.log("uninstalling: ", result.event.location);
      const location = result.event.location;
      await withPool(async () => {
        await uninstall(location);
      });
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
