import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { subscriptions } from "./subscriptions";

export const poll: APIGatewayProxyHandlerV2 = async (_) => {
  await subscriptions.initialising;
  await subscriptions.refresh();
  console.log("Refreshed all subscriptions");
  return {
    statusCode: 200,
    message: "Refreshed all subscriptions",
  };
};
