import {
  BotClientFactory,
  ChatActionScope,
  InstallationLocation,
  InstallationRecord,
  OCErrorCode,
  Permissions,
} from "@open-ic/openchat-botclient-ts";
import {
  getBatchOfChannels,
  getInstallation,
  getSubscriptionsForChannelIds,
  hasSubscription,
  pruneChannels,
  saveInstallation,
  subscribe,
  subscribedChannelIds,
  uninstall,
  unsubscribe,
  updateChannelsLastUpdate,
  updateYoutubeChannel,
  withPool,
} from "./db/database";
import { getMostRecentVideo, getVideosSince } from "./youtube";

const BATCH_SIZE = 50;

export type ChannelStats = {
  youtubeChannelId: string;
  subscribers: number;
  lastUpdated: bigint;
};

function leastRecentlyUpdated(a: ChannelStats, b: ChannelStats): number {
  return Number(a.lastUpdated - b.lastUpdated);
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
    return withPool(async () => {
      if (!(await hasSubscription(scope, channelId))) {
        return;
      }
      return getMostRecentVideo(channelId);
    });
  }

  async list(scope: ChatActionScope): Promise<ChannelStats[]> {
    return withPool(() => subscribedChannelIds(scope));
  }

  async subscribe(
    youtubeChannelId: string,
    scope: ChatActionScope
  ): Promise<boolean> {
    return withPool(() => subscribe(youtubeChannelId, scope));
  }

  async install(
    location: InstallationLocation,
    record: InstallationRecord
  ): Promise<void> {
    await withPool(async () => {
      await saveInstallation(location, record);
    });
  }

  async uninstall(location: InstallationLocation): Promise<void> {
    await withPool(async () => {
      await uninstall(location);
    });
  }

  async unsubscribe(
    youtubeChannelId: string,
    scope: ChatActionScope
  ): Promise<boolean> {
    await withPool(async () => {
      await unsubscribe(youtubeChannelId, scope);
    });
    return true;
  }

  async refreshScope(scope: ChatActionScope) {
    let refreshed = true;
    await withPool(async () => {
      const installation = await getInstallation(scope);
      if (
        installation === undefined ||
        !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
      ) {
        refreshed = false;
        return;
      }

      const channels = await subscribedChannelIds(scope);

      if (channels) {
        try {
          for (const { youtubeChannelId, lastUpdated } of channels) {
            const msgTxt = await getVideosSince(youtubeChannelId, lastUpdated);
            if (msgTxt === undefined) continue;

            await updateYoutubeChannel(youtubeChannelId, BigInt(Date.now()));

            await this.#sendNewContentForSubscription(
              installation.apiGateway,
              installation.grantedAutonomousPermissions,
              scope,
              youtubeChannelId,
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

  async #processQueue() {
    await pruneChannels();
    const channels = await getBatchOfChannels();
    const newContent = await this.#getNewContentForBatch(channels);
    const channelIdsWithUpdates = [...newContent.keys()];
    await updateChannelsLastUpdate(channelIdsWithUpdates, BigInt(Date.now()));

    const subsToUpdate = await getSubscriptionsForChannelIds(
      channelIdsWithUpdates
    );

    const sendPromises: Promise<void>[] = [];
    for (const {
      apiGateway,
      autonomousPermissions,
      scope,
      channelId,
    } of subsToUpdate) {
      const msgText = newContent.get(channelId);
      if (
        !autonomousPermissions.hasMessagePermission("Text") ||
        msgText === undefined
      ) {
        continue;
      }
      sendPromises.push(
        this.#sendNewContentForSubscription(
          apiGateway,
          autonomousPermissions,
          scope,
          channelId,
          msgText
        )
      );
    }
    await sendPromises;
  }

  async #getNewContentForBatch(
    channels: { channelId: string; lastUpdated: bigint }[]
  ): Promise<Map<string, string>> {
    console.log(
      "Checking for new content for the following channels: ",
      channels
    );
    const results = new Map<string, string>();
    await Promise.all(
      channels.map((channel) =>
        getVideosSince(channel.channelId, channel.lastUpdated).then((msg) => {
          if (msg !== undefined) {
            results.set(channel.channelId, msg);
          }
        })
      )
    );
    return results;
  }

  async refresh() {
    withPool(async () => {
      try {
        await this.#processQueue();
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
