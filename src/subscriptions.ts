import {
  ActionScope,
  BotClientFactory,
  ChatActionScope,
  chatIdentifierToInstallationLocation,
  InstallationLocation,
  InstallationRecord,
  InstallationRegistry,
  OCErrorCode,
  Permissions,
} from "@open-ic/openchat-botclient-ts";
import { withState } from "./firebase";
import { getMostRecentVideo, getVideosSince } from "./youtube";

const BATCH_SIZE = 50;

type SerialisedScope = string;

export type ChannelStats = {
  youtubeChannelId: string;
  subscribers: number;
  lastUpdated: number;
};

export type State = {
  installs: InstallationRegistry;
  subscriptions: Map<SerialisedScope, Set<string>>;
  youtubeChannels: Map<string, ChannelStats>;
};

function leastRecentlyUpdated(a: ChannelStats, b: ChannelStats): number {
  return a.lastUpdated - b.lastUpdated;
}

class Subscriptions {
  constructor(private factory: BotClientFactory) {}

  async #sendNewContentForSubscription(
    apiGateway: string,
    permissions: Permissions,
    scope: ChatActionScope,
    youtubeChannelId: string,
    msgTxt: string
  ): Promise<void> {
    const client = this.factory.createClientInAutonomouseContext(
      scope,
      apiGateway,
      permissions
    );

    try {
      console.debug(
        "Sending new content for channel",
        youtubeChannelId,
        msgTxt
      );
      const msg = await client.createTextMessage(msgTxt);
      await client.sendMessage(msg).then((resp) => {
        if (
          resp.kind === "error" &&
          resp.code === OCErrorCode.InitiatorNotAuthorized
        ) {
          // this key is probably revoked so let's remove the subscription
          this.unsubscribe(youtubeChannelId, scope);
        }
        return resp;
      });
    } catch (err) {
      console.error(
        "Error processing subscription",
        scope,
        youtubeChannelId,
        err
      );
      throw err;
    }
  }

  async mostRecent(
    scope: ChatActionScope,
    channelId: string
  ): Promise<string | undefined> {
    let msgTxt: string | undefined = undefined;

    await withState(async (state) => {
      const { installs, subscriptions, youtubeChannels } = state;
      const location = chatIdentifierToInstallationLocation(scope.chat);
      const installation = installs.get(location);
      if (
        installation === undefined ||
        !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
      ) {
        return;
      }

      const channelIds = subscriptions.get(scope.toString());
      if (channelIds === undefined) return;

      if (!channelIds.has(channelId)) return;

      const stats = youtubeChannels.get(channelId);
      if (stats === undefined) return;

      msgTxt = await getMostRecentVideo(channelId);
    });
    return msgTxt;
  }

  async list(scope: ChatActionScope): Promise<ChannelStats[]> {
    const stats: ChannelStats[] = [];

    await withState(async (state) => {
      const { subscriptions, youtubeChannels } = state;
      const channelIds = subscriptions.get(scope.toString());
      if (channelIds !== undefined) {
        for (const channelId of channelIds) {
          const s = youtubeChannels.get(channelId);
          if (s !== undefined) {
            stats.push(s);
          }
        }
      }
    });

    return stats;
  }

  #incrementChannel(
    youtubeChannels: Map<string, ChannelStats>,
    youtubeChannelId: string
  ) {
    const stats = youtubeChannels.get(youtubeChannelId) ?? {
      youtubeChannelId,
      subscribers: 0,
      lastUpdated: Date.now(),
    };
    stats.subscribers += 1;
    youtubeChannels.set(youtubeChannelId, stats);
  }

  #decrementChannel(
    youtubeChannels: Map<string, ChannelStats>,
    youtubeChannelId: string
  ) {
    const stats = youtubeChannels.get(youtubeChannelId);
    if (stats !== undefined) {
      stats.subscribers -= 1;
      if (stats.subscribers === 0) {
        youtubeChannels.delete(youtubeChannelId);
      }
    }
  }

  #updateChannel(
    youtubeChannels: Map<string, ChannelStats>,
    youtubeChannelId: string,
    lastUpdated: number
  ) {
    const stats = youtubeChannels.get(youtubeChannelId);
    if (stats) {
      stats.lastUpdated = lastUpdated;
      youtubeChannels.set(youtubeChannelId, stats);
    }
  }

  async subscribe(
    youtubeChannelId: string,
    scope: ChatActionScope
  ): Promise<boolean> {
    // big problem with this - if two people subscribe concurrently
    // the the last write will win and the other user's sub will be lost
    // We need to use a firestore tx for the whole thing
    let subscribed = false;

    await withState(async (state) => {
      const { installs, subscriptions, youtubeChannels } = state;
      const location = chatIdentifierToInstallationLocation(scope.chat);
      const installation = installs.get(location);
      if (
        installation === undefined ||
        !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
      ) {
        return;
      }
      const scopeStr = scope.toString();
      const current = subscriptions.get(scopeStr) ?? new Set();
      if (!current.has(youtubeChannelId)) {
        current.add(youtubeChannelId);
        this.#incrementChannel(youtubeChannels, youtubeChannelId);
        subscriptions.set(scopeStr, current);
        subscribed = true;
        return;
      }
    });

    return subscribed;
  }

  async install(
    location: InstallationLocation,
    record: InstallationRecord
  ): Promise<void> {
    await withState(async (state) => {
      state.installs.set(location, record);
    });
  }

  async uninstall(location: InstallationLocation): Promise<void> {
    await withState(async (state) => {
      const { installs, subscriptions } = state;
      installs.delete(location);
      subscriptions.forEach((subs, scopeStr) => {
        const scope = ActionScope.fromString(scopeStr);
        if (scope.isContainedBy(location)) {
          subscriptions.delete(scopeStr);
        }
      });
    });
  }

  async unsubscribe(
    youtubeChannelId: string,
    scope: ChatActionScope
  ): Promise<boolean> {
    await withState(async (state) => {
      const { subscriptions, youtubeChannels } = state;
      const scopeStr = scope.toString();
      const current = subscriptions.get(scopeStr);
      if (current) {
        if (current.has(youtubeChannelId)) {
          current.delete(youtubeChannelId);
          this.#decrementChannel(youtubeChannels, youtubeChannelId);
          subscriptions.set(scopeStr, current);
          if (current.size === 0) {
            subscriptions.delete(scopeStr);
          }
        }
      }
    });
    return true;
  }

  async refreshScope(scope: ChatActionScope) {
    let refreshed = true;
    await withState(async (state) => {
      const { installs, subscriptions, youtubeChannels } = state;
      const location = chatIdentifierToInstallationLocation(scope.chat);
      const installation = installs.get(location);
      if (
        installation === undefined ||
        !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
      ) {
        refreshed = false;
        return;
      }
      const scopeStr = scope.toString();
      const channels = subscriptions.get(scopeStr);
      if (channels) {
        try {
          for (const channelId of channels) {
            const stats = youtubeChannels.get(channelId);
            if (stats === undefined) continue;

            const msgTxt = await getVideosSince(channelId, stats.lastUpdated);
            if (msgTxt === undefined) continue;

            this.#updateChannel(youtubeChannels, channelId, Date.now());
            await this.#sendNewContentForSubscription(
              installation.apiGateway,
              installation.grantedAutonomousPermissions,
              scope,
              channelId,
              msgTxt
            );
          }
        } catch (err) {
          console.error("Error processing subscriptions", err);
        }
        refreshed = true;
      }
    });

    return refreshed;
  }

  #nextBatchOfChannels(
    youtubeChannels: Map<string, ChannelStats>
  ): Map<string, number> {
    const channels = [...youtubeChannels.values()];
    channels.sort(leastRecentlyUpdated);
    const batch = new Map<string, number>();
    for (const { youtubeChannelId, lastUpdated } of channels) {
      batch.set(youtubeChannelId, lastUpdated);
      if (batch.size >= BATCH_SIZE) {
        return batch;
      }
    }
    return batch;
  }

  // TODO - this could be a performance bottleneck
  #createReverseLookup(subscriptions: Map<string, Set<string>>) {
    const lookup = new Map<string, Set<string>>();
    subscriptions.forEach((subbed, scopeStr) => {
      subbed.forEach((channelId) => {
        const scopes = lookup.get(channelId) ?? new Set();
        scopes.add(scopeStr);
        lookup.set(channelId, scopes);
      });
    });
    return lookup;
  }

  async #cleanup(state: State) {
    for (const [scopeStr, channelIds] of state.subscriptions) {
      const scope = ActionScope.fromString(scopeStr) as ChatActionScope;
      const location = chatIdentifierToInstallationLocation(scope.chat);
      const installation = state.installs.get(location);
      if (installation !== undefined) {
        const client = this.factory.createClientInAutonomouseContext(
          scope,
          installation.apiGateway,
          installation.grantedAutonomousPermissions
        );
        for (const channelId of channelIds) {
          const valid = /^UC[a-zA-Z0-9_-]{22}$/.test(channelId);
          if (!valid) {
            console.log(`Removing channel: `, channelId);

            channelIds.delete(channelId);
            this.#decrementChannel(state.youtubeChannels, channelId);
            state.subscriptions.set(scopeStr, channelIds);
            if (channelIds.size === 0) {
              state.subscriptions.delete(scopeStr);
            }

            const msg = await client.createTextMessage(
              `Sorry but I have unsubscribed you from "${channelId}" because it does not appear to be a valid Youtube channel ID. The channel ID should start with "UC" and be followed by 22 characters. For information on how to find the correct channel ID please refer to [the readme](https://github.com/julianjelfs/youtube_lambda/blob/main/README.md).`
            );
            await client.sendMessage(msg);
          }
        }
      }
    }
  }

  async #processQueue(state: State) {
    // await this.#cleanup(state);
    const lookup = this.#createReverseLookup(state.subscriptions);
    const channelsBatch = this.#nextBatchOfChannels(state.youtubeChannels);
    const newContent = await this.#getNewContentForBatch(
      state.youtubeChannels,
      channelsBatch
    );
    const sendPromises: Promise<void>[] = [];
    for (const [channelId, msgTxt] of newContent) {
      const scopes = lookup.get(channelId);
      if (scopes !== undefined) {
        for (const scopeStr of scopes) {
          const scope = ActionScope.fromString(scopeStr) as ChatActionScope;
          const location = chatIdentifierToInstallationLocation(scope.chat);
          const installation = state.installs.get(location);
          if (
            installation === undefined ||
            !installation.grantedAutonomousPermissions.hasMessagePermission(
              "Text"
            )
          ) {
            continue;
          }
          sendPromises.push(
            this.#sendNewContentForSubscription(
              installation.apiGateway,
              installation.grantedAutonomousPermissions,
              scope,
              channelId,
              msgTxt
            )
          );
        }
      }
    }
    await sendPromises;
  }

  async #getNewContentForBatch(
    channels: Map<string, ChannelStats>,
    batch: Map<string, number>
  ): Promise<Map<string, string>> {
    console.log(
      "Checking for new content for the following channels: ",
      batch.keys()
    );
    const timestamp = Date.now();
    const results = new Map<string, string>();
    await Promise.all(
      [...batch.entries()].map(([channelId, lastUpdated]) =>
        getVideosSince(channelId, lastUpdated).then((msg) => {
          if (msg !== undefined) {
            results.set(channelId, msg);
            this.#updateChannel(channels, channelId, timestamp);
          }
        })
      )
    );
    return results;
  }

  async refresh() {
    await withState(async (state) => {
      try {
        await this.#processQueue(state);
      } catch (err) {
        console.error("Error processing subscriptions", err);
      }
    });
  }
}

export const subscriptions = new Subscriptions(
  new BotClientFactory({
    openchatPublicKey: process.env.OC_PUBLIC!,
    icHost: process.env.IC_HOST!,
    identityPrivateKey: process.env.IDENTITY_PRIVATE!,
    openStorageCanisterId: process.env.STORAGE_INDEX_CANISTER!,
  })
);
