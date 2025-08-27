import {
  BotClient,
  BotEvent,
  handleNotification,
  InstallationRecord,
} from "@open-ic/openchat-botclient-ts";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { saveInstallation, uninstall, withPool } from "./db/database";
import { factory } from "./factory";

export const notify: APIGatewayProxyHandlerV2 = async (event) => {
  return handleNotification(
    event.body!,
    factory,
    async (client: BotClient, ev: BotEvent, apiGateway: string) => {
      if (ev.kind === "bot_installed_event") {
        console.log("installing: ", ev.location);
        const location = ev.location;
        const record = new InstallationRecord(
          apiGateway,
          ev.grantedAutonomousPermissions,
          ev.grantedCommandPermissions
        );

        await withPool(async () => {
          await saveInstallation(location, record);
        });
      }
      if (ev.kind === "bot_uninstalled_event") {
        console.log("uninstalling: ", ev.location);
        const location = ev.location;
        await withPool(async () => {
          await uninstall(location);
        });
      }
      return {
        statusCode: 200,
      };
    },
    (error) => {
      console.error("Bot event parsing failed", error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Failed to parse bot event",
          error,
        }),
      };
    }
  );
};
