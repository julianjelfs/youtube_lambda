import Parser from "rss-parser";

const parser = new Parser();

export async function getMostRecentVideo(
  channelId: string
): Promise<string | undefined> {
  let msgs = await getVideosSinceViaRSS(channelId, 0);
  return msgs?.[0];
}

async function getChannel(
  channelId: string
): Promise<Parser.Output<{}> | undefined> {
  try {
    const feed = await parser.parseURL(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );
    return feed;
  } catch (err) {
    // let's come back to this and try to implement it
    // such that if a feed cannot be loaded 5 times, then we unsubscribe
    console.log("Error getting rss feed", err, err.message.includes("404"));
    return undefined;
  }
}

export async function getChannelName(
  channelId: string
): Promise<string | undefined> {
  try {
    const feed = await parser.parseURL(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );
    return feed.title;
  } catch (err) {
    console.log("Error getting rss feed", err, err.message.includes("404"));
    return undefined;
  }
}

export async function getVideosSince(
  channelId: string,
  since: number
): Promise<string | undefined> {
  let msgs = await getVideosSinceViaRSS(channelId, since);
  return msgs !== undefined && msgs.length > 0 ? msgs.join("\n") : undefined;
}

async function getVideosSinceViaRSS(
  channelId: string,
  since: number
): Promise<string[] | undefined> {
  try {
    const feed = await parser.parseURL(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );

    const msgs: string[] = [];
    feed.items.forEach((item) => {
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
  } catch (err) {
    console.log(
      "Error getting RSS feed: ",
      channelId,
      err,
      " falling back to google api"
    );
    return undefined;
  }
}
