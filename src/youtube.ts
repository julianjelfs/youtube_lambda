import { google } from "googleapis";
import Parser from "rss-parser";

const parser = new Parser();
const youtube = google.youtube({
  version: "v3",
  auth: process.env.YOUTUBE_API_KEY,
});

// TODO - the youtube api doesn't have a very generous quota so it would be good to switch this over to using RSS.
// Which then turns this into a general purpose RSS bot, which is cool
// We could then add a /youtube command which would accept an @username and return the RSS url (or just subscribe to them for you)

export async function getMostRecentVideo(
  channelId: string
): Promise<string | undefined> {
  let msgs = await getVideosSinceViaRSS(channelId, 0);
  if (msgs === undefined) {
    msgs = await getVideosSinceFromGoogle(channelId, 0);
  }
  return msgs?.[0];
}

export async function getVideosSince(channelId: string, since: number) {
  // prefer RSS
  let msgs = await getVideosSinceViaRSS(channelId, since);
  if (msgs === undefined) {
    msgs = await getVideosSinceFromGoogle(channelId, since);
  }
  return msgs !== undefined && msgs.length > 0 ? msgs.join("\n") : undefined;
}

async function getVideosSinceFromGoogle(
  channelId: string,
  since: number
): Promise<string[] | undefined> {
  const res = await youtube.search.list({
    part: ["id", "snippet"],
    channelId,
    maxResults: 10,
    order: "date",
    type: ["video"],
    publishedAfter: new Date(Number(since)).toISOString(),
  });

  const msgs: string[] = [];
  console.log("Data", res.data.items);
  res.data.items?.forEach((item) => {
    if (item.id?.kind === "youtube#video") {
      msgs.push(`[${item.snippet?.title}](${item.id?.videoId})`);
    }
  });

  console.log("Found the following videos with google api: ", msgs);

  return msgs;
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
