import { SlackCommandMiddlewareArgs } from '@slack/bolt';

import { getOrCreateUser } from '../database/queries';

export async function handleBalance(args: SlackCommandMiddlewareArgs) {
    const { command, ack, respond } = args;
    await ack();

    try {
        const user = await getOrCreateUser(
            command.user_id,
            command.user_name,
            command.channel_id
        );

    await respond({
  blocks: [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${command.user_name}'s Profile`,
        emoji: true
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:coin-mario: Wallet Balance*\n\`\`\`$${user.balance.toLocaleString()} HC\`\`\``
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:bank-pride: Bank Balance*\n\`\`\`$${user.bank.toLocaleString()} HC\`\`\``
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Deposit",
            emoji: true
          },
          action_id: "deposit_money",
          value: "deposit",
          style: "primary"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Withdraw",
            emoji: true
          },
          action_id: "withdraw_money",
          value: "withdraw"
        }
      ]
    }
  ],
  response_type: 'ephemeral'
});
    } catch (error) {
        console.error('Error in balance command:', error);
        await respond({
            text: '❌ Could not fetch balance. Please try again.',
            response_type: 'ephemeral'
        });
    }
}
