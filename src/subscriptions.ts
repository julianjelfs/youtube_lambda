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
import {
  readInstallationRegistry,
  readSubscriptions,
  writeInstallationRegistry,
  writeSubscriptions,
} from "./firebase";
import { getVideosSince } from "./youtube";

// This encodes where to send the message and what youtube channel we are interested in
export type Subscription = {
  youtubeChannelId: string;
  lastUpdated: number;
};

const BATCH_SIZE = 20;

// This will be the stringified subscription - bit pukey
type SubscriptionString = string;

type SerialisedScope = string;

function leastRecentlyUpdated(
  a: [Subscription, SerialisedScope],
  b: [Subscription, SerialisedScope]
): number {
  return a[0].lastUpdated - b[0].lastUpdated;
}

class Subscriptions {
  #installs = new InstallationRegistry();
  #subscriptions = new Map<SerialisedScope, Set<SubscriptionString>>();
  initialising: Promise<void>;

  constructor(private factory: BotClientFactory) {
    this.initialising = Promise.all([
      readInstallationRegistry(),
      readSubscriptions(),
    ]).then(([installations, subscriptions]) => {
      this.#installs = InstallationRegistry.fromMap(installations);
      this.#subscriptions = subscriptions;
    });
  }

  #subscriptionToString(sub: Subscription): string {
    return JSON.stringify(sub);
  }

  #subscriptionFromString(str: string): Subscription {
    return JSON.parse(str);
  }

  async #sendNewContentForSubscription(
    apiGateway: string,
    permissions: Permissions,
    scope: ChatActionScope,
    sub: Subscription,
    msgTxt: string
  ): Promise<void> {
    const { youtubeChannelId, lastUpdated } = sub;
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
      this.#updateSubscription(scope, sub);
    } catch (err) {
      console.error("Error processing subscription", scope, sub, err);
      throw err;
    }
  }

  #updateSubscription(scope: ChatActionScope, sub: Subscription) {
    const scopeStr = scope.toString();
    const subs = this.#subscriptions.get(scopeStr) ?? new Set();
    subs.delete(this.#subscriptionToString(sub));
    subs.add(this.#subscriptionToString({ ...sub, lastUpdated: Date.now() }));
    this.#subscriptions.set(scopeStr, subs);
  }

  list(scope: ChatActionScope): Subscription[] {
    const subs = this.#subscriptions.get(scope.toString());
    if (subs === undefined) {
      console.log(
        "We didn't find and subscriptions for the following scope",
        scope
      );
      return [];
    }
    return [...subs].map((s) => this.#subscriptionFromString(s));
  }

  subscribe(youtubeChannelId: string, scope: ChatActionScope): boolean {
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
    current.add(
      this.#subscriptionToString({
        youtubeChannelId,
        lastUpdated: Date.now(),
      })
    );
    this.#subscriptions.set(scopeStr, current);
    writeSubscriptions(this.#subscriptions);
    return true;
  }

  install(location: InstallationLocation, record: InstallationRecord) {
    this.#installs.set(location, record);
    writeInstallationRegistry(this.#installs.toMap());
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
      const filtered = [...current.values()].filter((sub) => {
        const str = this.#subscriptionFromString(sub);
        return str.youtubeChannelId !== youtubeChannelId;
      });
      const updated = new Set(filtered);
      this.#subscriptions.set(scopeStr, updated);
      if (current.size === 0) {
        this.#subscriptions.delete(scopeStr);
      }
      writeSubscriptions(this.#subscriptions);
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
    const subs = this.#subscriptions.get(scopeStr);
    if (subs) {
      try {
        const content: [Subscription, string | undefined][] = await Promise.all(
          [...subs.values()].map(async (subStr) => {
            const sub = this.#subscriptionFromString(subStr);
            const msgTxt = await getVideosSince(
              sub.youtubeChannelId,
              sub.lastUpdated
            );
            return [sub, msgTxt];
          })
        );
        for (const [sub, msgTxt] of content) {
          if (msgTxt !== undefined) {
            await this.#sendNewContentForSubscription(
              installation.apiGateway,
              installation.grantedAutonomousPermissions,
              scope,
              sub,
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
      writeInstallationRegistry(this.#installs.toMap());
      writeSubscriptions(this.#subscriptions);
    } catch (err) {
      console.error("Error persisting state", err);
    }
  }

  async #processQueue() {
    const queue: [Subscription, SerialisedScope][] = [];
    for (const [scopeStr, subscriptions] of this.#subscriptions) {
      for (const subStr of subscriptions) {
        const sub = this.#subscriptionFromString(subStr);
        queue.push([sub, scopeStr]);
      }
    }
    queue.sort(leastRecentlyUpdated);
    const channels = this.#getBatchOfChannels(queue);
    const newContent = await this.#getNewContentForBatch(channels);
    const sendPromises: Promise<void>[] = [];
    for (const [sub, scopeStr] of queue) {
      const scope = ActionScope.fromString(scopeStr) as ChatActionScope;
      const location = chatIdentifierToInstallationLocation(scope.chat);
      const installation = this.#installs.get(location);
      if (
        installation === undefined ||
        !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
      ) {
        continue;
      }
      const msgTxt = newContent.get(sub.youtubeChannelId);
      if (msgTxt) {
        sendPromises.push(
          this.#sendNewContentForSubscription(
            installation.apiGateway,
            installation.grantedAutonomousPermissions,
            scope,
            sub,
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
    queue: [Subscription, SerialisedScope][]
  ): Map<string, number> {
    const batch = new Map<string, number>();
    for (const [sub, _] of queue) {
      batch.set(sub.youtubeChannelId, sub.lastUpdated);
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
