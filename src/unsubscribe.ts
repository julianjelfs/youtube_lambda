import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import {
    unsubscribe as dbUnsubscribe,
    unsubscribeAll as dbUnsubscribeAll,
    withPool,
} from "./db/database";
import {
    ephemeralResponse,
    formatChannelId,
    validateChannelId,
} from "./helpers";

export async function unsubscribeAll(
    client: BotClient,
): Promise<APIGatewayProxyResultV2> {
    const scope = client.scope as ChatActionScope;
    return ephemeralResponse(client, await unsubscribe_all(scope));
}

export async function unsubscribe(
    client: BotClient,
): Promise<APIGatewayProxyResultV2> {
    const channel = client.stringArg("channel_id");
    const scope = client.scope as ChatActionScope;

    return ephemeralResponse(
        client,
        await unsubscribe_from_channel(scope, channel),
    );
}

export async function unsubscribe_all(scope: ChatActionScope): Promise<string> {
    await withPool(async () => {
        await dbUnsubscribeAll(scope);
    });
    return Promise.resolve(
        `You are now unsubscribed from all YouTube channels`,
    );
}

export async function unsubscribe_from_channel(
    scope: ChatActionScope,
    channelId?: string,
): Promise<string> {
    const invalid = validateChannelId(channelId);
    if (invalid) {
        return invalid;
    }

    await withPool(() => dbUnsubscribe(channelId!, scope));
    return Promise.resolve(
        `You are now unsubscribed from YouTube channel: ${formatChannelId(
            channelId!,
        )}`,
    );
}
