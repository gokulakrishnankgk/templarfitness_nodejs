const { IncomingWebhook } = require('@slack/webhook');
const slackUrl = process.env.LOG_SLACK_WEBHOOK_URL;
const webhook = new IncomingWebhook(slackUrl);

const sendSlack = async (data, message) => {
    await webhook.send({
        "blocks": [
            {
                "type": "rich_text",
                "elements": [
                    {
                        "type": "rich_text_section",
                        "elements": [
                            {
                                "type": "text",
                                "text": `${data}\n\n`
                            }
                        ]
                    },
                    {
                        "type": "rich_text_preformatted",
                        "elements": [
                            {
                                "type": "text",
                                "text": message,
                            }
                        ]
                    }
                ]
            }
        ]
    }
)};
module.exports = sendSlack;
    