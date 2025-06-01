This is an OpenChat bot which allows you to subscribe to one or more YouTube channels and get notified in OpenChat when a new video is published to that channel.

## How to use this bot

First you will need to install the bot into a community or group that you own. The can be done via the Members section of either the group or the community by selecting the Add bots tab and choosing to install the youtube_bot.

Once you have installed the bot, simply use the `/subscribe` command to subscribe to one or more channels.

## Commands

`/subscribe [channelId]`

This command is used to subscribe to a particular YouTube channel using the channel ID. Once subscribed the bot will keep an eye on this channel checking every half an hour for new content. If new videos are found, they will be posted into the relevant OpenChat group or channel.

`/unsubscribe [channelId]`

This command is used to stop monitoring a particular YouTube channel.

`/list`

This command will list the YouTube channels that you are currently subscribed to in the context where you run the command.

`/refresh`

This command will immediately check all of the subscriptions in this context and post any new content. Note that you do not _need_ to call this. The bot will check regularly on its own half-hour schedule.

## Why channel ids?

Yes, it is a bit annoying that we have to use channel IDs to subscribe the channels but this is most unambiguous and reliable option.

To find the Channel ID for a YouTube channel, select the channel in YouTube, click "...more", scroll down to the bottom of the popup and click "Share channel" and choose "Copy channel ID".
