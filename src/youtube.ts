import Parser from "rss-parser";
import { FeedData } from "./types";

const parser = new Parser();

export async function getMostRecentVideo(
  channelId: string
): Promise<FeedData<string | undefined>> {
  const msgs = await getVideosSinceViaRSS(channelId, 0);
  return mapFeedData(msgs, (m) => m[0]);
}

function mapFeedData<A, B>(f: FeedData<A>, fn: (a: A) => B): FeedData<B> {
  if (f.kind === "feed_error") {
    return f;
  }
  return { kind: "feed_data", data: fn(f.data) };
}

async function getFeedData<T>(
  channelId: string,
  extract: (feed: Parser.Output<{}>) => T
): Promise<FeedData<T>> {
  try {
    const feed = await parser.parseURL(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );
    return { kind: "feed_data", data: extract(feed) };
  } catch (err) {
    return { kind: "feed_error" };
  }
}

export async function getFeedName(
  channelId: string
): Promise<FeedData<string | undefined>> {
  return getFeedData(channelId, (f) => f.title);
}

export async function getVideosSince(
  channelId: string,
  since: number
): Promise<FeedData<string | undefined>> {
  const msgs = await getVideosSinceViaRSS(channelId, since);
  return mapFeedData(msgs, (m) => (m.length > 0 ? m.join("\n") : undefined));
}

async function getVideosSinceViaRSS(
  channelId: string,
  since: number
): Promise<FeedData<string[]>> {
  return getFeedData(channelId, (f) => {
    const msgs: string[] = [];
    f.items.forEach((item) => {
      if (
        item.title &&
        item.link &&
        item.pubDate &&
        new Date(item.pubDate).getTime() > since
      ) {
        msgs.push(`[${item.title}](${item.link})`);
      }
    });
    return msgs;
  });
}
