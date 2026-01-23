/**
 * This file describes all of the functions that this bot provides described in a format that openai can understand
 */

import { FunctionTool } from "openai/resources/responses/responses.mjs";

export const functions: FunctionTool[] = [
    {
        type: "function",
        name: "subscribe_to_channel",
        description: "Subscribe the user to a single specific YouTube channel",
        parameters: {
            type: "object",
            properties: {
                channelId: {
                    type: ["string", "null"],
                    description:
                        "The channel id representing the single YouTube channel that the user requested, or null if unknown. Do not guess.",
                },
            },
            additionalProperties: false,
        },
        strict: false,
    },
    {
        type: "function",
        name: "unsubscribe_from_channel",
        description:
            "Unsubscribe the user from a single specific YouTube channel",
        parameters: {
            type: "object",
            properties: {
                channelId: {
                    type: ["string", "null"],
                    description:
                        "The channel id representing the single YouTube channel that the user requested, or null if unknown. Do not guess.",
                },
            },
            additionalProperties: false,
        },
        strict: false,
    },
    {
        type: "function",
        name: "most_recent",
        description:
            "Show me the most recent content from a single specific YouTube channel",
        parameters: {
            type: "object",
            properties: {
                channelId: {
                    type: ["string", "null"],
                    description:
                        "The channel id representing the single YouTube channel that the user requested, or null if unknown. Do not guess.",
                },
            },
            additionalProperties: false,
        },
        strict: false,
    },
    {
        type: "function",
        name: "unsubscribe_all",
        description: "Unsubscribe from all of my channels",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
        },
        strict: false,
    },
    {
        type: "function",
        name: "list_subscriptions",
        description: "List all of my current subscriptions",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
        },
        strict: false,
    },
    {
        type: "function",
        name: "refresh_subscriptions",
        description:
            "Refresh all of my current YouTube subscriptions and post any new available content",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
        },
        strict: false,
    },
    {
        type: "function",
        name: "no_op",
        description:
            "Use this when the user input does not correspond to any supported action",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
        },
        strict: false,
    },
];
