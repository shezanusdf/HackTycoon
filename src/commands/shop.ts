import { SlackCommandMiddlewareArgs } from '@slack/bolt';
import { getOrCreateUser, updateBalance, prisma } from '../database/queries';

export const SHOP_ITEMS = [
  { id: "coffee", name: ":coffee: Coffee Machine", price: 500, description: "Essential for coding" },
  { id: "laptop", name: ":m1max: MacBook Pro", price: 2000, description: "Faster development" },
  { id: "chair", name: ":chair: Herman Miller Chair", price: 1500, description: "Comfort matters" },
  { id: "monitor", name: ":desktop_computer: 4K Monitor", price: 1000, description: "More screen space" },
  { id: "desk", name: ":office: Standing Desk", price: 800, description: "Healthy workspace" },
  { id: "headphones", name: ":headphones: AirPods Max", price: 600, description: "Focus mode" },
  { id: "keyboard", name: ":keyboard: Mechanical Keyboard", price: 300, description: "Clicky satisfaction" },
];

export async function handleShop(args: SlackCommandMiddlewareArgs) {
  const { ack, respond, command } = args;
  await ack();

  try {
    const slackId = command.user_id;
    const username = command.user_name;
    const channelId = command.channel_id;

    // Get user
    const user = await getOrCreateUser(slackId, username, channelId);

  // Get owned items (JSON)
  const ownedItems = user.ownedItems ? JSON.parse(user.ownedItems) : [];

  const args_parts = command.text.split(' ');
  const action = args_parts[0];
  const itemId = args_parts[1];

  // Handle buying
  if (action === 'buy') {
    if (!itemId) {
      await respond({
        text: ':x: Usage: `/shop buy <item>`\nExample: `/shop buy coffee`',
        response_type: 'ephemeral'
      });
      return;
    }

    const item = SHOP_ITEMS.find(i => i.id === itemId);

    if (!item) {
      await respond({
        text: `:x: Item not found! Use \`/shop\` to see available items.`,
        response_type: 'ephemeral'
      });
      return;
    }

    if (ownedItems.includes(item.id)) {
      await respond({
        text: `:x: You already own ${item.name}!`,
        response_type: 'ephemeral'
      });
      return;
    }

    if (user.balance < item.price) {
      await respond({
        text: `:x: Not enough HC!\n\n${item.name} costs $${item.price.toLocaleString()} HC\nYou have $${user.balance.toLocaleString()} HC`,
        response_type: 'ephemeral'
      });
      return;
    }

    // Buy the item
    ownedItems.push(item.id);
    await updateBalance(slackId, channelId, -item.price);
    await prisma.user.update({
      where: { slackId_channelId: { slackId, channelId } },
      data: { ownedItems: JSON.stringify(ownedItems) }
    });

    await respond({
      text: `:tick-daamin: Purchased ${item.name} for $${item.price.toLocaleString()} HC!\n\n:flying_money_with_wings: New balance: $${(user.balance - item.price).toLocaleString()} HC`,
      response_type: 'ephemeral'
    });
    return;
  }

  //shop catalog
  const shopBlocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":alibaba-shopping: Hack Tycoon Shop",
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:coin-mario: Your Balance:* \`$${user.balance.toLocaleString()} HC\``
      }
    },
    {
      type: "divider"
    }
  ];

  // Add each item as a section
  SHOP_ITEMS.forEach(item => {
    const owned = ownedItems.includes(item.id);

    shopBlocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: owned
          ? `*${item.name}* :tick-daamin:\n_${item.description}_\n*OWNED*`
          : `*${item.name}*\n_${item.description}_\n*Price:* \`$${item.price.toLocaleString()} HC\``
      },
      accessory: owned ? undefined : {
        type: "button",
        text: {
          type: "plain_text",
          text: "Buy",
          emoji: true
        },
        value: item.id,
        action_id: `buy_${item.id}`,
        style: "primary"
      }
    });
  });

  shopBlocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "💡 _Or use_ `/shop buy <item>` _to purchase_"
      }
    ]
  });

  await respond({
    blocks: shopBlocks,
    response_type: 'ephemeral'
  });
  } catch (error) {
    console.error('Error in shop command:', error);
    await respond({
      text: '❌ Could not load shop. Please try again.',
      response_type: 'ephemeral'
    });
  }
}

export async function handleShopPurchase(args: any) {
  const { ack, body, client } = args;

  const userId = body.user.id;
  const username = body.user.username;
  const channelId = (body as any).channel?.id || (body as any).container?.channel_id;
  const actionId = body.actions[0].action_id;

  // Extract item ID from action_id (e.g., "buy_coffee" -> "coffee")
  const itemId = actionId.replace('buy_', '');

  if (!channelId) {
    await ack();
    console.error('Channel ID not found');
    return;
  }

  try {
    await ack();

    // Get user and item
    const user = await getOrCreateUser(userId, username, channelId);
    const item = SHOP_ITEMS.find(i => i.id === itemId);

    if (!item) {
      await client.chat.postMessage({
        channel: channelId,
        text: `:x: <@${userId}> Item not found!`
      });
      return;
    }

    // Check if already owned
    const ownedItems = user.ownedItems ? JSON.parse(user.ownedItems) : [];
    if (ownedItems.includes(item.id)) {
      await client.chat.postMessage({
        channel: channelId,
        text: `:x: <@${userId}> You already own ${item.name}!`
      });
      return;
    }

    // Check if can afford
    if (user.balance < item.price) {
      await client.chat.postMessage({
        channel: channelId,
        text: `:x: <@${userId}> Not enough money in wallet!\n\n${item.name} costs $${item.price.toLocaleString()} HC\nYou have $${user.balance.toLocaleString()} HC in your wallet`
      });
      return;
    }

    // Purchase the item
    ownedItems.push(item.id);
    await updateBalance(userId, channelId, -item.price);
    await prisma.user.update({
      where: { slackId_channelId: { slackId: userId, channelId } },
      data: { ownedItems: JSON.stringify(ownedItems) }
    });

    // Get updated balance
    const updatedUser = await getOrCreateUser(userId, username, channelId);

    // Send success message
    await client.chat.postMessage({
      channel: channelId,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `:tick-daamin: Purchase Successful!`,
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<@${userId}> bought ${item.name} for $${item.price.toLocaleString()} HC!`
          }
        },
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*:coin-mario: Wallet Balance*\n\`\`\`$${updatedUser.balance.toLocaleString()} HC\`\`\``
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*:bank-pride: Bank Balance*\n\`\`\`$${updatedUser.bank.toLocaleString()} HC\`\`\``
          }
        }
      ],
      text: `:tick-daamin: Purchase Successful! ${item.name}`
    });
  } catch (error) {
    console.error('Error in shop purchase:', error);
    await ack();
  }
}
