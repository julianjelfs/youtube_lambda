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
import { readAll, writeAll } from "./firebase";
import { getVideosSince } from "./youtube";

const BATCH_SIZE = 20;

type SerialisedScope = string;

export type ChannelStats = {
  youtubeChannelId: string;
  subscribers: number;
  lastUpdated: number;
};

const nullStats: ChannelStats = {
  youtubeChannelId: "",
  subscribers: 0,
  lastUpdated: 0,
};

function leastRecentlyUpdated(
  a: [ChannelStats, SerialisedScope],
  b: [ChannelStats, SerialisedScope]
): number {
  return a[0].lastUpdated - b[0].lastUpdated;
}

class Subscriptions {
  #installs = new InstallationRegistry();
  #subscriptions = new Map<SerialisedScope, Set<string>>(); // Scope -> Set<YoutubeChannelId>
  #youtubeChannels = new Map<string, ChannelStats>(); // YoutubeChannelId -> { subscribers, lastUpdated }
  initialising: Promise<void>;

  constructor(private factory: BotClientFactory) {
    this.initialising = readAll().then(([subs, channels, installs]) => {
      this.#subscriptions = subs;
      this.#youtubeChannels = channels;
      this.#installs = InstallationRegistry.fromMap(installs);
    });
  }

  async #sendNewContentForSubscription(
    apiGateway: string,
    permissions: Permissions,
    scope: ChatActionScope,
    stats: ChannelStats,
    msgTxt: string
  ): Promise<void> {
    const { youtubeChannelId, lastUpdated } = stats;
    const client = this.factory.createClientInAutonomouseContext(
      scope,
      apiGateway,
      permissions
    );

    try {
      console.debug(
        "Sending new content for channel",
        youtubeChannelId,
        lastUpdated,
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
      console.error("Error processing subscription", scope, stats, err);
      throw err;
    }
  }

  async list(scope: ChatActionScope): Promise<ChannelStats[]> {
    const channelIds = this.#subscriptions.get(scope.toString());
    const stats: ChannelStats[] = [];
    if (channelIds !== undefined) {
      for (const channelId of channelIds) {
        const s = this.#youtubeChannels.get(channelId);
        if (s !== undefined) {
          stats.push(s);
        }
      }
    }
    return stats;
  }

  #incrementChannel(youtubeChannelId: string) {
    const stats = this.#youtubeChannels.get(youtubeChannelId) ?? {
      youtubeChannelId,
      subscribers: 0,
      lastUpdated: Date.now(),
    };
    stats.subscribers += 1;
    this.#youtubeChannels.set(youtubeChannelId, stats);
  }

  #decrementChannel(youtubeChannelId: string) {
    const stats = this.#youtubeChannels.get(youtubeChannelId);
    if (stats !== undefined) {
      stats.subscribers -= 1;
      if (stats.subscribers === 0) {
        this.#youtubeChannels.delete(youtubeChannelId);
      }
    }
  }

  #updateChannel(youtubeChannelId: string, lastUpdated: number) {
    const stats = this.#youtubeChannels.get(youtubeChannelId);
    if (stats) {
      stats.lastUpdated = lastUpdated;
      this.#youtubeChannels.set(youtubeChannelId, stats);
    }
  }

  subscribe(youtubeChannelId: string, scope: ChatActionScope): boolean {
    try {
      const location = chatIdentifierToInstallationLocation(scope.chat);
      const installation = this.#installs.get(location);
      if (
        installation === undefined ||
        !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
      ) {
        return false;
      }
      const scopeStr = scope.toString();
      const current = this.#subscriptions.get(scopeStr) ?? new Set();
      if (!current.has(youtubeChannelId)) {
        current.add(youtubeChannelId);
        this.#incrementChannel(youtubeChannelId);
        this.#subscriptions.set(scopeStr, current);
        return true;
      }
      return false;
    } finally {
      this.#persistState();
    }
  }

  install(location: InstallationLocation, record: InstallationRecord) {
    this.#installs.set(location, record);
    this.#persistState();
  }

  uninstall(location: InstallationLocation) {
    this.#installs.delete(location);
    this.#subscriptions.forEach((subs, scopeStr) => {
      const scope = ActionScope.fromString(scopeStr);
      if (scope.isContainedBy(location)) {
        this.#subscriptions.delete(scopeStr);
      }
    });
    this.#persistState();
  }

  unsubscribe(youtubeChannelId: string, scope: ChatActionScope): boolean {
    const scopeStr = scope.toString();
    const current = this.#subscriptions.get(scopeStr);
    if (current) {
      if (current.has(youtubeChannelId)) {
        current.delete(youtubeChannelId);
        this.#decrementChannel(youtubeChannelId);
        this.#subscriptions.set(scopeStr, current);
        if (current.size === 0) {
          this.#subscriptions.delete(scopeStr);
        }
        this.#persistState();
      }
    }
    return true;
  }

  async refreshScope(scope: ChatActionScope) {
    const location = chatIdentifierToInstallationLocation(scope.chat);
    const installation = this.#installs.get(location);
    if (
      installation === undefined ||
      !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
    ) {
      return false;
    }
    const scopeStr = scope.toString();
    const channels = this.#subscriptions.get(scopeStr);
    if (channels) {
      try {
        const content: [ChannelStats, string | undefined][] = await Promise.all(
          [...channels.values()].map(async (channelId) => {
            const stats = this.#youtubeChannels.get(channelId) ?? nullStats;
            const msgTxt = await getVideosSince(channelId, stats.lastUpdated);
            this.#updateChannel(channelId, Date.now());
            return [stats, msgTxt];
          })
        );
        for (const [stats, msgTxt] of content) {
          if (msgTxt !== undefined) {
            await this.#sendNewContentForSubscription(
              installation.apiGateway,
              installation.grantedAutonomousPermissions,
              scope,
              stats,
              msgTxt
            );
          }
        }
      } catch (err) {
        console.error("Error processing subscriptions", err);
      } finally {
        this.#persistState();
      }
      return true;
    }
  }

  async #persistState() {
    try {
      writeAll(
        this.#subscriptions,
        this.#youtubeChannels,
        this.#installs.toMap()
      );
    } catch (err) {
      console.error("Error persisting state", err);
    }
  }

  async #processQueue() {
    const queue: [ChannelStats, SerialisedScope][] = [];
    for (const [scopeStr, channelIds] of this.#subscriptions) {
      for (const channelId of channelIds) {
        const stats = this.#youtubeChannels.get(channelId);
        if (stats !== undefined) {
          queue.push([stats, scopeStr]);
        }
      }
    }
    queue.sort(leastRecentlyUpdated);
    const channels = this.#getBatchOfChannels(queue);
    const newContent = await this.#getNewContentForBatch(channels);
    const sendPromises: Promise<void>[] = [];
    for (const [stats, scopeStr] of queue) {
      const scope = ActionScope.fromString(scopeStr) as ChatActionScope;
      const location = chatIdentifierToInstallationLocation(scope.chat);
      const installation = this.#installs.get(location);
      if (
        installation === undefined ||
        !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
      ) {
        continue;
      }
      const msgTxt = newContent.get(stats.youtubeChannelId);
      if (msgTxt) {
        sendPromises.push(
          this.#sendNewContentForSubscription(
            installation.apiGateway,
            installation.grantedAutonomousPermissions,
            scope,
            stats,
            msgTxt
          )
        );
      }
    }
    await Promise.all(sendPromises);
  }

  async #getNewContentForBatch(
    batch: Map<string, number>
  ): Promise<Map<string, string>> {
    console.log(
      "Checking for new content for the following channels: ",
      batch.keys()
    );
    const results = new Map<string, string>();
    await Promise.all(
      [...batch.entries()].map(([channelId, lastUpdated]) =>
        getVideosSince(channelId, lastUpdated).then((msg) => {
          if (msg !== undefined) {
            results.set(channelId, msg);
          }
        })
      )
    );
    return results;
  }

  #getBatchOfChannels(
    queue: [ChannelStats, SerialisedScope][]
  ): Map<string, number> {
    const batch = new Map<string, number>();
    for (const [stats, _] of queue) {
      batch.set(stats.youtubeChannelId, stats.lastUpdated);
      if (batch.size >= BATCH_SIZE) {
        return batch;
      }
    }
    return batch;
  }

  async refresh() {
    try {
      await this.#processQueue();
    } catch (err) {
      console.error("Error processing subscriptions", err);
    } finally {
      this.#persistState();
    }
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
