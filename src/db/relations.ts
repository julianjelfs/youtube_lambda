import { relations } from "drizzle-orm/relations";
import { installations, subscriptions, subscriptionChannels } from "./schema";

export const subscriptionsRelations = relations(subscriptions, ({one, many}) => ({
	installation: one(installations, {
		fields: [subscriptions.location],
		references: [installations.location]
	}),
	subscriptionChannels: many(subscriptionChannels),
}));

export const installationsRelations = relations(installations, ({many}) => ({
	subscriptions: many(subscriptions),
}));

export const subscriptionChannelsRelations = relations(subscriptionChannels, ({one}) => ({
	subscription: one(subscriptions, {
		fields: [subscriptionChannels.location],
		references: [subscriptions.location]
	}),
}));