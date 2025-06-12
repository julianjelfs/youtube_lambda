import {
  ActionScope,
  ChatActionScope,
  installationLocationFromJSON,
  InstallationRecord,
} from "@open-ic/openchat-botclient-ts";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { saveInstallation, subscribe, withPool } from "./db/database";
import { readAll } from "./firebase";

export const migrate: APIGatewayProxyHandlerV2 = async (_) => {
  await withPool(async () => {
    try {
      const { installs, subscriptions } = await readAll();

      // first migrate all of the installations
      const installsMap = installs.toMap();
      for (const [k, v] of installsMap) {
        const location = installationLocationFromJSON(JSON.parse(k));
        const record = InstallationRecord.fromString(v);
        await saveInstallation(location, record);
      }

      // next go through all of the pairs of scope & channel and subscribe to them
      for (const [scopeStr, channels] of subscriptions) {
        const scope = ActionScope.fromString(scopeStr) as ChatActionScope;
        for (const channelId of channels) {
          await subscribe(channelId, scope);
        }
      }
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify(err),
      };
    }
  });
  return {
    statusCode: 200,
  };
};
