import { Permissions } from "@open-ic/openchat-botclient-ts";
import type { APIGatewayProxyHandler } from "aws-lambda";

export const definition: APIGatewayProxyHandler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify(schema()),
  };
};

const emptyPermissions = {
  chat: [],
  community: [],
  message: [],
};

function schema() {
  return {
    autonomous_config: {
      sync_api_key: true,
      permissions: Permissions.encodePermissions({
        message: ["Text"],
        community: [],
        chat: [],
      }),
    },
    description:
      "This bot allows you to subscribe to a youtube channel and will post an update to your group or channel when a new video is posted.\n\nFor usage intstructions please check [the readme](https://github.com/julianjelfs/youtube_lambda).",
    commands: [
      {
        name: "most_recent",
        default_role: "Participant",
        description:
          "Get the most recent video for one of your subscribed channels.",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [
          {
            name: "channel_id",
            required: true,
            description: "The YouTube channel that you wish to check",
            placeholder: "Enter the YouTube channel to check",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 1000,
                choices: [],
                multi_line: false,
              },
            },
          },
        ],
      },
      {
        name: "list",
        default_role: "Participant",
        description:
          "List the current Youtube channel subscriptions for this context",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [],
      },
      {
        name: "refresh",
        default_role: "Participant",
        description:
          "Refresh your current subscriptions and post videos if there are any. Note your subscriptions will be checked every half an hour automatically.",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [],
      },
      {
        name: "subscribe",
        default_role: "Owner",
        description: "Subscribe to a specific YouTube channel",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [
          {
            name: "channel_id",
            required: true,
            description: "The YouTube channel that you wish to subscribe to",
            placeholder: "Enter the YouTube channel to subscibe to",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 1000,
                choices: [],
                multi_line: false,
              },
            },
          },
        ],
      },
      {
        name: "unsubscribe",
        default_role: "Owner",
        description: "Unsubscribe from a specific YouTube channel",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [
          {
            name: "channel_id",
            required: true,
            description:
              "The YouTube channel that you wish to unsubscribe from",
            placeholder: "Enter the YouTube channel to unsubscribe from",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 1000,
                choices: [],
                multi_line: false,
              },
            },
          },
        ],
      },
    ],
  };
}
