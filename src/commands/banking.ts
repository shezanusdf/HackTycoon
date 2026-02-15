import { getOrCreateUser, prisma } from '../database/queries';

export async function handleDeposit(args: any) {
  const { ack, body, client } = args;

  const userId = body.user.id;
  const channelId = (body as any).channel?.id || (body as any).container?.channel_id;

  if (!channelId) {
    await ack();
    console.error('Channel ID not found');
    return;
  }

  // Open modal immediately WITHOUT calling ack() first
  // Opening the modal itself acknowledges the interaction and prevents expired_trigger_id
  try {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'deposit_modal',
        title: {
          type: 'plain_text',
          text: 'Deposit Money'
        },
        submit: {
          type: 'plain_text',
          text: 'Deposit'
        },
        close: {
          type: 'plain_text',
          text: 'Cancel'
        },
        blocks: [
          {
            type: 'input',
            block_id: 'amount_block',
            element: {
              type: 'plain_text_input',
              action_id: 'amount_input',
              placeholder: {
                type: 'plain_text',
                text: 'Enter amount to deposit'
              }
            },
            label: {
              type: 'plain_text',
              text: 'Amount (HC)'
            }
          }
        ],
        private_metadata: JSON.stringify({ channelId })
      }
    });
    await ack();
  } catch (error) {
    console.error('Error opening deposit modal:', error);
    await ack();
  }
}

export async function handleWithdraw(args: any) {
  const { ack, body, client } = args;

  const userId = body.user.id;
  const channelId = (body as any).channel?.id || (body as any).container?.channel_id;

  if (!channelId) {
    await ack();
    console.error('Channel ID not found');
    return;
  }

  // Open modal immediately WITHOUT calling ack() first
  // Opening the modal itself acknowledges the interaction and prevents expired_trigger_id
  try {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'withdraw_modal',
        title: {
          type: 'plain_text',
          text: 'Withdraw Money'
        },
        submit: {
          type: 'plain_text',
          text: 'Withdraw'
        },
        close: {
          type: 'plain_text',
          text: 'Cancel'
        },
        blocks: [
          {
            type: 'input',
            block_id: 'amount_block',
            element: {
              type: 'plain_text_input',
              action_id: 'amount_input',
              placeholder: {
                type: 'plain_text',
                text: 'Enter amount to withdraw'
              }
            },
            label: {
              type: 'plain_text',
              text: 'Amount (HC)'
            }
          }
        ],
        private_metadata: JSON.stringify({ channelId })
      }
    });
    await ack();
  } catch (error) {
    console.error('Error opening withdraw modal:', error);
    await ack();
  }
}

export async function handleDepositSubmit(args: any) {
  const { ack, body, view, client } = args;

  try {
    const amount = view.state.values.amount_block.amount_input.value;
    const amountNum = parseInt(amount);
    const metadata = JSON.parse(view.private_metadata);
    const channelId = metadata.channelId;
    const userId = body.user.id;

    // Validate amount
    if (isNaN(amountNum) || amountNum <= 0) {
      await ack({
        response_action: 'errors',
        errors: {
          amount_block: 'Please enter a valid positive number'
        }
      });
      return;
    }

    await ack();

  // Get user
  const user = await getOrCreateUser(userId, body.user.username, channelId);

  // Check if user has enough in wallet
  if (user.balance < amountNum) {
    await client.chat.postMessage({
      channel: channelId,
      text: `:x: <@${userId}> Not enough money in wallet! You have $${user.balance.toLocaleString()} HC but tried to deposit $${amountNum.toLocaleString()} HC.`
    });
    return;
  }

  // Transfer from balance to bank
  await prisma.user.update({
    where: { slackId_channelId: { slackId: userId, channelId } },
    data: {
      balance: { decrement: amountNum },
      bank: { increment: amountNum }
    }
  });

  const newBalance = user.balance - amountNum;
  const newBank = user.bank + amountNum;

  await client.chat.postMessage({
    channel: channelId,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `:tick-daamin: Deposited $${amountNum.toLocaleString()} HC to your bank!`,
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
          text: `*:coin-mario: Wallet Balance*\n\`\`\`$${newBalance.toLocaleString()} HC\`\`\``
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*:bank-pride: Bank Balance*\n\`\`\`$${newBank.toLocaleString()} HC\`\`\``
        }
      }
    ],
    text: `:tick-daamin: Deposited $${amountNum.toLocaleString()} HC to your bank!`
  });
  } catch (error) {
    console.error('Error in deposit:', error);
    await ack();
  }
}

export async function handleWithdrawSubmit(args: any) {
  const { ack, body, view, client } = args;

  try {
    const amount = view.state.values.amount_block.amount_input.value;
    const amountNum = parseInt(amount);
    const metadata = JSON.parse(view.private_metadata);
    const channelId = metadata.channelId;
    const userId = body.user.id;

    // Validate amount
    if (isNaN(amountNum) || amountNum <= 0) {
      await ack({
        response_action: 'errors',
        errors: {
          amount_block: 'Please enter a valid positive number'
        }
      });
      return;
    }

    await ack();

  // Get user
  const user = await getOrCreateUser(userId, body.user.username, channelId);

  // Check if user has enough in bank
  if (user.bank < amountNum) {
    await client.chat.postMessage({
      channel: channelId,
      text: `:x: <@${userId}> Not enough money in bank! You have $${user.bank.toLocaleString()} HC but tried to withdraw $${amountNum.toLocaleString()} HC.`
    });
    return;
  }

  // Transfer from bank to balance
  await prisma.user.update({
    where: { slackId_channelId: { slackId: userId, channelId } },
    data: {
      bank: { decrement: amountNum },
      balance: { increment: amountNum }
    }
  });

  const newBalance = user.balance + amountNum;
  const newBank = user.bank - amountNum;

  await client.chat.postMessage({
    channel: channelId,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `:tick-daamin: Withdrew $${amountNum.toLocaleString()} HC from your bank!`,
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
          text: `*:coin-mario: Wallet Balance*\n\`\`\`$${newBalance.toLocaleString()} HC\`\`\``
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*:bank-pride: Bank Balance*\n\`\`\`$${newBank.toLocaleString()} HC\`\`\``
        }
      }
    ],
    text: `:tick-daamin: Withdrew $${amountNum.toLocaleString()} HC from your bank!`
  });
  } catch (error) {
    console.error('Error in withdraw:', error);
    await ack();
  }
}
