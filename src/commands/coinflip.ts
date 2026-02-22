import { getOrCreateUser, prisma } from "../database/queries";

const MIN_BET = 10;
const MAX_BET = 100000;
const COINFLIP_COOLDOWN_SECONDS = 5;

async function canCoinflip(slackId: string, channelId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: {slackId_channelId: {slackId, channelId}}
    });

    if (!user || !user.lastCoinflip) return true;
    const diffSeconds = (new Date().getTime() - user.lastCoinflip.getTime()) / 1000
    return diffSeconds >= COINFLIP_COOLDOWN_SECONDS;
}

export async function handleCoinflip(args: any) {
    const {  command,ack,say,respond } = args;
    await ack();

    const slackId = command.user_id;
    const username = command.user_name;
    const channelId = command.channel_id;
    const text = command.text.trim();
    const parts = text.split(/\s+/);

    // Check if it's a PvP challenge (starts with @)
    if (parts[0] && parts[0].startsWith('<@')) {
        await handleCoinflipChallenge(args);
        return;
    }

    const betAmount = parseInt(text);

    if (!betAmount || betAmount < MIN_BET) {
        await respond({ text: `❌ Usage: \coinflip <amount>\nMin: $${MIN_BET} HC`, response_type: 'ephemeral' });
        return;
    }

    if (!betAmount || betAmount > MAX_BET) {
        await respond({ text: `❌ Usage: \coinflip <amount>\Max: $${MAX_BET} HC`, response_type: 'ephemeral' });
        return;
    }
    if (!(await canCoinflip(slackId, channelId))) {
        await respond({ text: `⏰ Wait ${COINFLIP_COOLDOWN_SECONDS}s between flips`, response_type: 'ephemeral' });
        return;
    }

    const user = await getOrCreateUser(slackId,username, channelId);
    if (user.balance < betAmount) {
        await respond({ text: `❌Not Enough! You have $${user.balance.toLocaleString()} HC`, response_type: 'ephemeral'});
        return;
    }

    await say({
        blocks: [
            {type: 'header', text: {type: 'plain_text', text: '🪙 COINFLIP', emoji: true}},
            {type: 'section', text: { type: 'mrkdwn', text: `<@${slackId}> betting $${betAmount.toLocaleString()} HC\nChoose:`}},
            {
                type: 'actions',
                elements: [
                   {type: 'button', text: {type: 'plain_text', text: '🟡 HEADS' }, value: JSON.stringify({ betAmount, slackId, channelId}), action_id: 'coinflip_heads', style: 'primary'},
                   {type: 'button', text: {type: 'plain_text', text: '⚪ TAILS' }, value: JSON.stringify({ betAmount, slackId, channelId}), action_id: 'coinflip_tails'}
                ]
            }
        ]
    });
}

export async function handleCoinflipChoice(args: any) {
    const { ack,body,client,action } = args;
    await ack();

    const {betAmount, slackId, channelId } =JSON.parse(action.value);
    if (body.user.id !== slackId) return;

    const choice = action.action_id === 'coinflip_heads' ? 'HEADS' : 'TAILS';
    const result = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
    const won = choice === result;

    await prisma.user.update({
        where: {slackId_channelId: {slackId,channelId}},
        data: {
            balance: { increment: won ? betAmount : -betAmount},
            lastCoinflip: new Date(),
            coinflipsPlayed: { increment: 1},
            coinflipsWon: won ? {increment: 1} : undefined
        }
    });

    const user = await prisma.user.findUnique({ where: {slackId_channelId: {slackId, channelId}}});

    await client.chat.update({
        channel: channelId,
        ts: body.message.ts,
        blocks: [
            { type: 'header', text: { type: 'plain_text', text: won ? '✅ WON!' : '❌ LOST'}},
            { type: 'section', text: { type: 'mrkdwn', text: `Chose **${choice}**\nLanded **${result}**\n\n${won ? `+$${betAmount.toLocaleString()}` : `-$${betAmount.toLocaleString()}`} HC\nBalance: $${user?.balance.toLocaleString()} HC` } }
        ]
    });

}

// PvP Challenge Handler
async function handleCoinflipChallenge(args: any) {
    const { command, ack, say, respond, client } = args;

    try {
        const challengerSlackId = command.user_id;
        const challengerUsername = command.user_name;
        const channelId = command.channel_id;

        const text = command.text.trim();
        const parts = text.split(/\s+/);

        const targetMention = parts[0];
        const targetSlackId = targetMention.replace(/<@|>|\|.*/g, '');
        const betAmount = parseInt(parts[1]);

        if (!targetSlackId || targetSlackId === challengerSlackId) {
            await respond({
                text: "❌ You can't challenge yourself!",
                response_type: 'ephemeral'
            });
            return;
        }

        if (!betAmount || isNaN(betAmount) || betAmount < MIN_BET) {
            await respond({
                text: `❌ Usage: \`/coinflip @user <amount>\`\nExample: \`/coinflip @alice 500\`\n\nMinimum bet: $${MIN_BET.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        if (betAmount > MAX_BET) {
            await respond({
                text: `❌ Maximum bet is $${MAX_BET.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        const challenger = await getOrCreateUser(challengerSlackId, challengerUsername, channelId);
        const target = await prisma.user.findUnique({
            where: { slackId_channelId: { slackId: targetSlackId, channelId } }
        });

        if (!target) {
            await respond({
                text: "❌ That user hasn't played the game yet!",
                response_type: 'ephemeral'
            });
            return;
        }

        if (challenger.balance < betAmount) {
            await respond({
                text: `❌ Not enough HC! You have $${challenger.balance.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        if (target.balance < betAmount) {
            await respond({
                text: `❌ <@${targetSlackId}> doesn't have enough HC! They need $${betAmount.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        const totalPot = betAmount * 2;
        const houseFee = Math.floor(totalPot * 0.05);
        const winnerPayout = totalPot - houseFee;

        const message = await say({
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '⚔️ COINFLIP CHALLENGE ⚔️',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${challengerSlackId}> challenged <@${targetSlackId}> to a coinflip duel!`
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `💰 *Bet (each):* \`$${betAmount.toLocaleString()} HC\`\n🎁 *Total Pot:* \`$${totalPot.toLocaleString()} HC\`\n💸 *House Fee (5%):* \`$${houseFee.toLocaleString()} HC\`\n👑 *Winner Gets:* \`$${winnerPayout.toLocaleString()} HC\``
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${targetSlackId}>, do you accept?`
                    }
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '✅ Accept', emoji: true },
                            value: JSON.stringify({ challengerSlackId, targetSlackId, betAmount, channelId, timestamp: Date.now() }),
                            action_id: 'challenge_accept',
                            style: 'primary'
                        },
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '❌ Decline', emoji: true },
                            value: JSON.stringify({ challengerSlackId, targetSlackId }),
                            action_id: 'challenge_decline',
                            style: 'danger'
                        }
                    ]
                },
                {
                    type: 'context',
                    elements: [{ type: 'mrkdwn', text: '⏰ Challenge expires in 60 seconds' }]
                }
            ]
        });

        // Send DM notification
        try {
            await client.chat.postMessage({
                channel: targetSlackId,
                text: `⚔️ <@${challengerSlackId}> challenged you to a $${betAmount.toLocaleString()} HC coinflip duel! Check the channel to accept or decline.`
            });
        } catch (err) {
            // DMs disabled
        }

        // Auto-cancel after 60 seconds
        setTimeout(async () => {
            try {
                await client.chat.update({
                    channel: channelId,
                    ts: message.ts,
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '⏰ EXPIRED', emoji: true } },
                        { type: 'section', text: { type: 'mrkdwn', text: `<@${targetSlackId}> didn't respond in time. Challenge cancelled.` } }
                    ]
                });
            } catch (err) {
                // Already updated
            }
        }, 60000);

    } catch (error) {
        console.error('Error in coinflip challenge:', error);
        await respond({
            text: '❌ Something went wrong! Please try again.',
            response_type: 'ephemeral'
        });
    }
}

// Challenge Response Handler
export async function handleChallengeResponse(args: any) {
    const { ack, body, client, action } = args;
    await ack();

    try {
        const data = JSON.parse(action.value);
        const { challengerSlackId, targetSlackId, betAmount, channelId, timestamp } = data;
        const userId = body.user.id;

        if (timestamp && Date.now() - timestamp > 60000) {
            await client.chat.postEphemeral({
                channel: channelId,
                user: userId,
                text: '❌ This challenge has expired!'
            });
            return;
        }

        if (userId !== targetSlackId) {
            await client.chat.postEphemeral({
                channel: channelId,
                user: userId,
                text: "❌ This challenge isn't for you!"
            });
            return;
        }

        if (action.action_id === 'challenge_decline') {
            await client.chat.update({
                channel: channelId,
                ts: body.message.ts,
                blocks: [
                    { type: 'header', text: { type: 'plain_text', text: '❌ DECLINED', emoji: true } },
                    { type: 'section', text: { type: 'mrkdwn', text: `<@${targetSlackId}> declined the challenge. 💔` } }
                ]
            });
            return;
        }

        // Accept - flip coin
        await client.chat.update({
            channel: channelId,
            ts: body.message.ts,
            blocks: [
                { type: 'header', text: { type: 'plain_text', text: '🪙 FLIPPING...', emoji: true } },
                { type: 'section', text: { type: 'mrkdwn', text: `<@${targetSlackId}> accepted! 🎲 Flipping the coin...` } }
            ]
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const result = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
        const challengerWins = result === 'HEADS';
        const winnerSlackId = challengerWins ? challengerSlackId : targetSlackId;
        const loserSlackId = challengerWins ? targetSlackId : challengerSlackId;

        const totalPot = betAmount * 2;
        const houseFee = Math.floor(totalPot * 0.05);
        const winnerPayout = totalPot - houseFee - betAmount;

        await prisma.user.update({
            where: { slackId_channelId: { slackId: winnerSlackId, channelId } },
            data: {
                balance: { increment: winnerPayout },
                lastCoinflip: new Date(),
                coinflipsPlayed: { increment: 1 },
                coinflipsWon: { increment: 1 }
            }
        });

        await prisma.user.update({
            where: { slackId_channelId: { slackId: loserSlackId, channelId } },
            data: {
                balance: { decrement: betAmount },
                lastCoinflip: new Date(),
                coinflipsPlayed: { increment: 1 }
            }
        });

        const winner = await prisma.user.findUnique({ where: { slackId_channelId: { slackId: winnerSlackId, channelId } } });
        const loser = await prisma.user.findUnique({ where: { slackId_channelId: { slackId: loserSlackId, channelId } } });

        await client.chat.update({
            channel: channelId,
            ts: body.message.ts,
            blocks: [
                { type: 'header', text: { type: 'plain_text', text: '👑 DUEL COMPLETE!', emoji: true } },
                { type: 'section', text: { type: 'mrkdwn', text: `Coin landed on **${result}**!` } },
                { type: 'divider' },
                { type: 'section', text: { type: 'mrkdwn', text: `👑 *WINNER:* <@${winnerSlackId}>\n\`\`\`+$${winnerPayout.toLocaleString()} HC\`\`\`` } },
                { type: 'section', text: { type: 'mrkdwn', text: `💀 *LOSER:* <@${loserSlackId}>\n\`\`\`-$${betAmount.toLocaleString()} HC\`\`\`` } },
                { type: 'divider' },
                {
                    type: 'section',
                    fields: [
                        { type: 'mrkdwn', text: `*<@${winnerSlackId}>*\n$${winner?.balance.toLocaleString()} HC` },
                        { type: 'mrkdwn', text: `*<@${loserSlackId}>*\n$${loser?.balance.toLocaleString()} HC` }
                    ]
                },
                { type: 'context', elements: [{ type: 'mrkdwn', text: `💸 House fee: $${houseFee.toLocaleString()} HC (5%)` }] }
            ]
        });

    } catch (error) {
        console.error('Error in challenge response:', error);
    }
}
