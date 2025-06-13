import { InstallationRegistry } from "@open-ic/openchat-botclient-ts";

export type ChannelStats = {
  youtubeChannelId: string;
  subscribers: number;
  lastUpdated: number;
};

export type State = {
  installs: InstallationRegistry;
  subscriptions: Map<string, Set<string>>;
  youtubeChannels: Map<string, ChannelStats>;
};
