import { BotClient, ChatActionScope } from "@open-ic/openchat-botclient-ts";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import OpenAI from "openai";
import { ResponseInputItem } from "openai/resources/responses/responses.mjs";
import { functions } from "./functions";
import { ephemeralResponse } from "./helpers";
import { list_subscriptions } from "./list";
import { most_recent } from "./mostrecent";
import { refresh_subscriptions } from "./refresh";
import { subscribe_to_channel } from "./subscribe";
import { unsubscribe_all, unsubscribe_from_channel } from "./unsubscribe";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function prompt(
    client: BotClient,
): Promise<APIGatewayProxyResultV2> {
    const prompt = client.stringArg("prompt");
    const scope = client.scope as ChatActionScope;

    if (prompt) {
        const input: ResponseInputItem[] = [
            {
                role: "system",
                content: `
            You are a bot that only handles YouTube subscriptions.
            Only call functions provided in the tools array. Do not make up new functions. If the input does not match a real function, just call the no_op function.
            `,
            },

            { role: "user", content: prompt },
        ];

        let response = await openai.responses.create({
            model: "gpt-3.5-turbo",
            tools: functions,
            input,
        });

        let result = "";

        for (const item of response.output) {
            if (item.type == "function_call") {
                if (item.name === "no_op") {
                    result =
                        "Sorry but I can only help you with questions related to your YouTube subscriptions";
                }
                if (item.name === "refresh_subscriptions") {
                    result = await refresh_subscriptions(client);
                }
                if (item.name === "list_subscriptions") {
                    result = await list_subscriptions(scope);
                }
                if (item.name === "unsubscribe_all") {
                    result = await unsubscribe_all(scope);
                }
                if (item.name === "most_recent") {
                    result = await most_recent(
                        scope,
                        JSON.parse(item.arguments).channelId,
                    );
                }
                if (item.name === "unsubscribe_from_channel") {
                    result = await unsubscribe_from_channel(
                        scope,
                        JSON.parse(item.arguments).channelId,
                    );
                }
                if (item.name == "subscribe_to_channel") {
                    result = await subscribe_to_channel(
                        scope,
                        JSON.parse(item.arguments).channelId,
                    );
                }
            }
        }

        return ephemeralResponse(client, result);
    } else {
        return ephemeralResponse(
            client,
            "You must tell me what you want me to do!",
        );
    }
}
