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

function leastRecentlyUpdated(a: ChannelStats, b: ChannelStats): number {
  return a.lastUpdated - b.lastUpdated;
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

  async subscribe(
    youtubeChannelId: string,
    scope: ChatActionScope
  ): Promise<boolean> {
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
      await this.#persistState();
    }
  }

  async install(
    location: InstallationLocation,
    record: InstallationRecord
  ): Promise<void> {
    this.#installs.set(location, record);
    await this.#persistState();
  }

  async uninstall(location: InstallationLocation): Promise<void> {
    this.#installs.delete(location);
    this.#subscriptions.forEach((subs, scopeStr) => {
      const scope = ActionScope.fromString(scopeStr);
      if (scope.isContainedBy(location)) {
        this.#subscriptions.delete(scopeStr);
      }
    });
    await this.#persistState();
  }

  async unsubscribe(
    youtubeChannelId: string,
    scope: ChatActionScope
  ): Promise<boolean> {
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
        await this.#persistState();
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
        for (const channelId of channels) {
          const stats = this.#youtubeChannels.get(channelId);
          if (stats === undefined) continue;

          const msgTxt = await getVideosSince(channelId, stats.lastUpdated);
          if (msgTxt === undefined) continue;

          this.#updateChannel(channelId, Date.now());
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
      } finally {
        await this.#persistState();
      }
      return true;
    }
  }

  async #persistState(): Promise<void> {
    try {
      await writeAll(
        this.#subscriptions,
        this.#youtubeChannels,
        this.#installs.toMap()
      );
    } catch (err) {
      console.error("Error persisting state", err);
    }
  }

  #nextBatchOfChannels(): Map<string, number> {
    const channels = [...this.#youtubeChannels.values()];
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
  #createReverseLookup() {
    const lookup = new Map<string, Set<string>>();
    this.#subscriptions.forEach((subbed, scopeStr) => {
      subbed.forEach((channelId) => {
        const scopes = lookup.get(channelId) ?? new Set();
        scopes.add(scopeStr);
        lookup.set(channelId, scopes);
      });
    });
    return lookup;
  }

  async #processQueue() {
    const lookup = this.#createReverseLookup();
    const channels = this.#nextBatchOfChannels();
    const newContent = await this.#getNewContentForBatch(channels);
    const sendPromises: Promise<void>[] = [];
    for (const [channelId, msgTxt] of newContent) {
      const scopes = lookup.get(channelId);
      if (scopes !== undefined) {
        for (const scopeStr of scopes) {
          const scope = ActionScope.fromString(scopeStr) as ChatActionScope;
          const location = chatIdentifierToInstallationLocation(scope.chat);
          const installation = this.#installs.get(location);
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
            this.#updateChannel(channelId, timestamp);
          }
        })
      )
    );
    return results;
  }

  async refresh() {
    try {
      await this.#processQueue();
    } catch (err) {
      console.error("Error processing subscriptions", err);
    } finally {
      await this.#persistState();
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
