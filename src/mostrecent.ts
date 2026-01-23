import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { hasSubscription, withPool } from "./db/database";
import { ephemeralResponse, validateChannelId } from "./helpers";
import { getMostRecentVideo } from "./youtube";

export async function mostrecent(
    client: BotClient,
): Promise<APIGatewayProxyResultV2> {
    const channelId = client.stringArg("channel_id");
    const scope = client.scope as ChatActionScope;
    return ephemeralResponse(client, await most_recent(scope, channelId));
}

export async function most_recent(
    scope: ChatActionScope,
    channelId?: string,
): Promise<string> {
    const invalid = validateChannelId(channelId);
    if (invalid) {
        return invalid;
    }

    const msg = await withPool(async () => {
        if (!(await hasSubscription(scope, channelId!))) {
            return;
        }
        return getMostRecentVideo(channelId!);
    });

    if (
        msg === undefined ||
        msg.kind === "feed_error" ||
        msg.data === undefined
    ) {
        return "I couldn't find any content for this channel";
    }

    return msg.data;
}
