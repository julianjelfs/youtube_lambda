import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { subscribe as dbSubscribe, withPool } from "./db/database";
import {
    ephemeralResponse,
    formatChannelId,
    validateChannelId,
} from "./helpers";

export async function subscribe(
    client: BotClient,
): Promise<APIGatewayProxyResultV2> {
    const channel = client.stringArg("channel_id");
    const scope = client.scope as ChatActionScope;

    return ephemeralResponse(
        client,
        await subscribe_to_channel(scope, channel),
    );
}

export async function subscribe_to_channel(
    scope: ChatActionScope,
    channelId?: string,
): Promise<string> {
    const invalid = validateChannelId(channelId);
    if (invalid) {
        return invalid;
    }

    const result = await withPool(() => dbSubscribe(channelId!, scope));
    if (result.kind === "not_installed") {
        return "This bot does not seem to be install in this scope at the moment";
    }

    if (result.kind === "channel_not_found") {
        return "I can't seem to find that channel - double check the id and try again";
    }
    return Promise.resolve(
        `You are now subscribed to YouTube channel: ${formatChannelId(
            channelId!,
            result.channel.name ?? result.channel.youtubeChannelId,
        )}`,
    );
}
