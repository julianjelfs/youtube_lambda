import {
  ChatActionScope,
  OCErrorCode,
  Permissions,
} from "@open-ic/openchat-botclient-ts";
import { unsubscribe } from "./db/database";
import { factory } from "./factory";

export async function sendNewContentForSubscription(
  apiGateway: string,
  permissions: Permissions,
  scope: ChatActionScope,
  youtubeChannelId: string,
  msgTxt: string
): Promise<void> {
  const client = factory.createClientInAutonomouseContext(
    scope,
    apiGateway,
    permissions
  );

  try {
    console.debug("Sending new content for channel", youtubeChannelId, msgTxt);
    const msg = await client.createTextMessage(msgTxt);
    await client.sendMessage(msg).then(async (resp) => {
      if (resp.kind !== "success") {
        console.log("Sending new content to OC failed with: ", resp);
      }
      if (
        resp.kind === "error" &&
        resp.code === OCErrorCode.InitiatorNotAuthorized
      ) {
        // this key is probably revoked so let's remove the subscription
        await unsubscribe(youtubeChannelId, scope);
      }
      return resp;
    });
  } catch (err) {
    console.error(
      "Error processing subscription",
      scope,
      youtubeChannelId,
      err
    );
    throw err;
  }
}
