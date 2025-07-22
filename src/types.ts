import { InstallationRegistry } from "@open-ic/openchat-botclient-ts";

export type ChannelStats = {
  youtubeChannelId: string;
  lastUpdated: number;
  name?: string;
};

export type State = {
  installs: InstallationRegistry;
  subscriptions: Map<string, Set<string>>;
  youtubeChannels: Map<string, ChannelStats>;
};

export type FeedData<T> =
  | { kind: "feed_data"; data: T }
  | { kind: "feed_error" };

export type SubscribeResult = ChannelNotFound | SubscribeSuccess | NotInstalled;

export type ChannelNotFound = { kind: "channel_not_found" };
export type SubscribeSuccess = { kind: "success"; channel: ChannelStats };
export type NotInstalled = { kind: "not_installed" };
